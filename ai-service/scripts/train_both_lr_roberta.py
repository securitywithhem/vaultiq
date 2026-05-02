"""
train_both_lr_roberta.py — Train LR + Fine-tune RoBERTa on 80% of modern_llm_corpus

This script:
  1. Loads 80% sample of modern_llm_corpus.csv (3.2M rows)
  2. Trains HistGradientBoosting LR model on 13 statistical features
  3. Fine-tunes RoBERTa checkpoint on text classification task
  4. Evaluates both models
  5. Saves both trained models
"""

import json
import random
import re
import sys
import time
from collections import Counter
from pathlib import Path
from typing import List, Dict, Optional

import joblib
import numpy as np
import pandas as pd
import torch
from tqdm import tqdm
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    Trainer,
    TrainingArguments,
    DataCollatorWithPadding,
)
from datasets import Dataset

sys.path.insert(0, str(Path(__file__).parent.parent))
from core.detector import extract_features

# ─── Configuration ────────────────────────────────────────────
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

DS = Path(__file__).parent.parent / "datasets"
MODELS = Path(__file__).parent.parent / "models"
LOGS = Path(__file__).parent.parent / "logs"

MODELS.mkdir(exist_ok=True)
LOGS.mkdir(exist_ok=True)

# Hyperparameters
SAMPLE_RATIO = 0.80  # Use 80% of data
LR_PARAMS = dict(
    max_iter=800,
    learning_rate=0.05,
    max_depth=8,
    min_samples_leaf=60,
    l2_regularization=1.5,
    random_state=SEED,
    class_weight="balanced",
    early_stopping=True,
    validation_fraction=0.12,
    n_iter_no_change=40,
)

ROBERTA_MODEL = "Hello-SimpleAI/chatgpt-detector-roberta"
ROBERTA_EPOCHS = 3
ROBERTA_BATCH_SIZE = 16
ROBERTA_LR = 2e-5

URL_RE = re.compile(r"https?://\S+|www\.\S+")
WS_RE = re.compile(r"\s+")

# ─── Utilities ────────────────────────────────────────────────
def clean(raw: str) -> Optional[str]:
    """Clean text for training."""
    if not raw:
        return None
    t = raw.strip()
    if not (150 <= len(t) <= 8000):
        return None
    ascii_r = sum(1 for c in t if ord(c) < 128) / len(t)
    if ascii_r < 0.85:
        return None
    url_chars = sum(len(m.group()) for m in URL_RE.finditer(t))
    if url_chars / len(t) > 0.20:
        return None
    words = t.split()
    if len(words) < 30:
        return None
    lw = [w.lower() for w in words]
    if len(set(lw)) < 25:
        return None
    if max(Counter(lw).values()) / len(words) > 0.25:
        return None
    return t[:6000]


def load_modern_corpus_sample(path: Path, sample_ratio: float = 0.80) -> List[Dict]:
    """Load 80% sample of modern_llm_corpus.csv balanced AI/Human."""
    print(f"\n📂 Loading modern_llm_corpus.csv (sample ratio={sample_ratio})")

    # Read CSV
    df = pd.read_csv(path, usecols=["text", "label", "source"])
    df = df.dropna(subset=["text", "label"])

    # Calculate sample sizes
    total_ai = len(df[df["label"] == 1])
    total_human = len(df[df["label"] == 0])

    ai_sample = int(total_ai * sample_ratio)
    human_sample = int(total_human * sample_ratio)

    print(f"   Total AI: {total_ai:,} → Sample: {ai_sample:,}")
    print(f"   Total Human: {total_human:,} → Sample: {human_sample:,}")

    # Sample
    ai_df = df[df["label"] == 1].sample(n=ai_sample, random_state=SEED)
    human_df = df[df["label"] == 0].sample(n=human_sample, random_state=SEED)

    # Clean
    rows = []
    for _, row in pd.concat([ai_df, human_df]).iterrows():
        c = clean(str(row["text"]))
        if c:
            rows.append({
                "text": c,
                "label": int(row["label"]),
                "source": str(row["source"])
            })

    print(f"   ✓ Kept {len(rows):,} cleaned samples")
    return rows


def balance_data(rows: List[Dict]) -> List[Dict]:
    """Balance AI/Human samples."""
    ai = [r for r in rows if r["label"] == 1]
    human = [r for r in rows if r["label"] == 0]
    n = min(len(ai), len(human))

    print(f"\n⚖️  Balancing: AI={len(ai):,} Human={len(human):,} → {n:,} each")

    balanced = random.sample(ai, n) + random.sample(human, n)
    random.shuffle(balanced)

    return balanced


# ═══════════════════════════════════════════════════════════════
# PART 1: TRAIN LOGISTIC REGRESSION
# ═══════════════════════════════════════════════════════════════

def train_lr_model(rows: List[Dict]) -> tuple:
    """Extract features and train LR classifier."""
    print("\n" + "="*60)
    print("PART 1: TRAINING LOGISTIC REGRESSION MODEL")
    print("="*60)

    # Extract features
    print(f"\n🧪 Extracting 13 features from {len(rows):,} texts…")
    X = []
    y = []

    for r in tqdm(rows, desc="Extracting features"):
        try:
            features = extract_features(r["text"])
            X.append(features)
            y.append(r["label"])
        except Exception as e:
            print(f"   ⚠ Error extracting features: {e}")
            continue

    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.int32)

    print(f"   ✓ Extracted {len(X):,} feature vectors (shape: {X.shape})")

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, stratify=y, random_state=SEED
    )

    print(f"\n📐 Train={len(X_train):,}  Test={len(X_test):,}")

    # Train
    print("\n⚙️  Training HistGradientBoostingClassifier…")

    pipe = Pipeline([
        ("scaler", RobustScaler()),
        ("clf", HistGradientBoostingClassifier(**LR_PARAMS))
    ])

    pipe.fit(X_train, y_train)
    print(f"   ✓ Iterations used: {pipe.named_steps['clf'].n_iter_}")

    # Calibrate
    print("\n🔧 Calibrating (isotonic, cv=5)…")
    from sklearn.pipeline import Pipeline

    cal_pipe = Pipeline([
        ("scaler", RobustScaler()),
        ("clf", HistGradientBoostingClassifier(**LR_PARAMS))
    ])

    cal = CalibratedClassifierCV(cal_pipe, method="isotonic", cv=5)
    cal.fit(X_train, y_train)

    # Evaluate
    y_pred = cal.predict(X_test)
    y_prob = cal.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "f1": float(f1_score(y_test, y_pred)),
        "auc": float(roc_auc_score(y_test, y_prob)),
        "precision": float(precision_score(y_test, y_pred)),
        "recall": float(recall_score(y_test, y_pred)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
    }

    print(f"\n📊 LR Test Results (calibrated):")
    print(f"   Accuracy:  {metrics['accuracy']:.4f}")
    print(f"   F1 Score:  {metrics['f1']:.4f}")
    print(f"   AUC-ROC:   {metrics['auc']:.4f}")
    print(f"   Precision: {metrics['precision']:.4f}")
    print(f"   Recall:    {metrics['recall']:.4f}")

    return cal, metrics, (X_train, X_test, y_train, y_test)


def save_lr_model(model, metrics):
    """Save LR model and metrics."""
    print(f"\n💾 Saving LR model…")

    joblib.dump(model, MODELS / "lr_model_calibrated.pkl")
    joblib.dump(model, MODELS / "lr_model.pkl")

    dummy = StandardScaler()
    dummy.fit(np.zeros((2, 13)))
    joblib.dump(dummy, MODELS / "scaler.pkl")

    with open(MODELS / "training_metrics_lr.json", "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"   ✓ Saved to {MODELS}/")


# ═══════════════════════════════════════════════════════════════
# PART 2: FINE-TUNE ROBERTA
# ═══════════════════════════════════════════════════════════════

def tokenize_function(examples, tokenizer):
    """Tokenize texts for RoBERTa."""
    return tokenizer(
        examples["text"],
        padding="max_length",
        truncation=True,
        max_length=512,
    )


def train_roberta_model(rows: List[Dict]) -> tuple:
    """Fine-tune RoBERTa on text classification."""
    print("\n" + "="*60)
    print("PART 2: FINE-TUNING ROBERTA MODEL")
    print("="*60)

    # Check GPU
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\n🔧 Device: {device}")

    # Split data
    print(f"\n📐 Splitting {len(rows):,} texts…")
    train_rows, test_rows = train_test_split(
        rows, test_size=0.15, stratify=[r["label"] for r in rows], random_state=SEED
    )

    print(f"   Train: {len(train_rows):,}  Test: {len(test_rows):,}")

    # Convert to HuggingFace Dataset
    print("\n📦 Converting to HuggingFace Dataset…")

    train_dataset = Dataset.from_dict({
        "text": [r["text"] for r in train_rows],
        "label": [r["label"] for r in train_rows],
    })

    test_dataset = Dataset.from_dict({
        "text": [r["text"] for r in test_rows],
        "label": [r["label"] for r in test_rows],
    })

    # Load tokenizer
    print(f"\n🔤 Loading tokenizer: {ROBERTA_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(ROBERTA_MODEL)

    # Tokenize
    print("\n⚡ Tokenizing datasets…")
    train_dataset = train_dataset.map(
        lambda x: tokenize_function(x, tokenizer),
        batched=True,
        desc="Tokenizing train",
    )

    test_dataset = test_dataset.map(
        lambda x: tokenize_function(x, tokenizer),
        batched=True,
        desc="Tokenizing test",
    )

    # Remove text column
    train_dataset = train_dataset.remove_columns(["text"])
    test_dataset = test_dataset.remove_columns(["text"])

    train_dataset.set_format("torch")
    test_dataset.set_format("torch")

    # Load model
    print(f"\n🤖 Loading model: {ROBERTA_MODEL}")
    model = AutoModelForSequenceClassification.from_pretrained(
        ROBERTA_MODEL,
        num_labels=2,
    )
    model.to(device)

    # Training arguments
    training_args = TrainingArguments(
        output_dir=str(MODELS / "roberta_checkpoint"),
        overwrite_output_dir=True,
        num_train_epochs=ROBERTA_EPOCHS,
        per_device_train_batch_size=ROBERTA_BATCH_SIZE,
        per_device_eval_batch_size=ROBERTA_BATCH_SIZE,
        learning_rate=ROBERTA_LR,
        weight_decay=0.01,
        logging_steps=500,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        seed=SEED,
    )

    # Data collator
    data_collator = DataCollatorWithPadding(tokenizer)

    # Trainer
    print("\n🎓 Starting fine-tuning…")
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=test_dataset,
        data_collator=data_collator,
    )

    trainer.train()

    # Evaluate
    print("\n📊 Evaluating RoBERTa…")
    eval_results = trainer.evaluate()

    metrics = {
        "eval_loss": float(eval_results.get("eval_loss", 0)),
        "eval_accuracy": float(eval_results.get("eval_accuracy", 0)),
        "eval_f1": float(eval_results.get("eval_f1", 0)),
        "n_train": len(train_dataset),
        "n_test": len(test_dataset),
        "model": ROBERTA_MODEL,
        "epochs": ROBERTA_EPOCHS,
    }

    print(f"\n📊 RoBERTa Results:")
    print(f"   Loss:     {metrics['eval_loss']:.4f}")
    print(f"   Accuracy: {metrics['eval_accuracy']:.4f}")
    print(f"   F1 Score: {metrics['eval_f1']:.4f}")

    return model, tokenizer, metrics


def save_roberta_model(model, tokenizer, metrics):
    """Save fine-tuned RoBERTa."""
    print(f"\n💾 Saving RoBERTa model…")

    save_dir = MODELS / "roberta_finetuned"
    save_dir.mkdir(exist_ok=True)

    model.save_pretrained(save_dir)
    tokenizer.save_pretrained(save_dir)

    with open(save_dir / "training_metrics_roberta.json", "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"   ✓ Saved to {save_dir}/")


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    """Main training pipeline."""
    print("\n" + "="*60)
    print("TRAINING PIPELINE: LR + RoBERTa")
    print("="*60)

    start_time = time.time()

    # 1. Load data
    print("\n🔄 Step 1: Loading data (80% sample)…")
    rows = load_modern_corpus_sample(DS / "modern_llm_corpus.csv", sample_ratio=SAMPLE_RATIO)
    rows = balance_data(rows)

    # 2. Train LR
    print("\n🔄 Step 2: Training LR model…")
    lr_model, lr_metrics, _ = train_lr_model(rows)
    save_lr_model(lr_model, lr_metrics)

    # 3. Train RoBERTa
    print("\n🔄 Step 3: Fine-tuning RoBERTa…")
    roberta_model, roberta_tokenizer, roberta_metrics = train_roberta_model(rows)
    save_roberta_model(roberta_model, roberta_tokenizer, roberta_metrics)

    # Summary
    elapsed = time.time() - start_time
    print("\n" + "="*60)
    print("✅ TRAINING COMPLETE!")
    print("="*60)
    print(f"\n⏱️  Total time: {elapsed/3600:.2f} hours")
    print(f"\n📊 LR Model Metrics:")
    for k, v in lr_metrics.items():
        if isinstance(v, float):
            print(f"   {k}: {v:.4f}")
        else:
            print(f"   {k}: {v}")

    print(f"\n📊 RoBERTa Model Metrics:")
    for k, v in roberta_metrics.items():
        if isinstance(v, float):
            print(f"   {k}: {v:.4f}")
        else:
            print(f"   {k}: {v}")

    print(f"\n📁 Models saved to: {MODELS}/")


if __name__ == "__main__":
    main()
