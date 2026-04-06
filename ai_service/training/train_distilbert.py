"""
training/train_distilbert.py — Fine-tune DistilBERT for binary AI detection.

Steps:
  1. Load processed Parquet splits (run data_loader.py first).
  2. Tokenize with DistilBertTokenizerFast (max_length=512, truncation).
  3. Fine-tune with HuggingFace Trainer:
       - AdamW, lr=2e-5, weight_decay=0.01
       - Batch size 16, max 3 epochs, early stopping (patience=2)
       - Evaluate every 500 steps
  4. Save best checkpoint to models/distilbert_ai_detector/.
  5. Print per-epoch loss, accuracy, F1, ROC-AUC.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from datasets import Dataset
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    roc_auc_score,
)
from transformers import (
    DistilBertForSequenceClassification,
    DistilBertTokenizerFast,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

# Resolve project root
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config import (
    DISTILBERT_BASE_MODEL_ID,
    DISTILBERT_BATCH_SIZE,
    DISTILBERT_EVAL_STEPS,
    DISTILBERT_LEARNING_RATE,
    DISTILBERT_MAX_EPOCHS,
    DISTILBERT_MAX_LENGTH,
    DISTILBERT_MODEL_DIR,
    DISTILBERT_NUM_LABELS,
    DISTILBERT_PATIENCE,
    DISTILBERT_WEIGHT_DECAY,
    PROCESSED_DIR,
    RANDOM_SEED,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger(__name__)


# ─── Metric Computation ───────────────────────────────────────────────────────

def compute_metrics(eval_pred):
    """Compute accuracy, F1, and ROC-AUC for Trainer evaluation."""
    logits, labels = eval_pred
    probs = np.exp(logits) / np.exp(logits).sum(axis=-1, keepdims=True)
    preds = np.argmax(logits, axis=-1)
    ai_probs = probs[:, 1]

    acc = accuracy_score(labels, preds)
    f1  = f1_score(labels, preds, average="binary", zero_division=0)
    try:
        auc = roc_auc_score(labels, ai_probs)
    except ValueError:
        auc = 0.0

    return {"accuracy": acc, "f1": f1, "roc_auc": auc}


# ─── Main ─────────────────────────────────────────────────────────────────────

def train() -> None:
    processed_dir = Path(PROCESSED_DIR)
    train_path = processed_dir / "train.parquet"
    val_path   = processed_dir / "val.parquet"
    test_path  = processed_dir / "test.parquet"

    # ── Load data ─────────────────────────────────────────────────────────────
    if not train_path.exists():
        log.info("Processed data not found — running data_loader …")
        from training.data_loader import build_dataset
        build_dataset()

    train_df = pd.read_parquet(str(train_path))
    val_df   = pd.read_parquet(str(val_path))
    test_df  = pd.read_parquet(str(test_path))

    log.info(
        "Data loaded — train: %d | val: %d | test: %d",
        len(train_df), len(val_df), len(test_df),
    )

    # ── Tokenizer ─────────────────────────────────────────────────────────────
    log.info("Loading tokenizer: %s", DISTILBERT_BASE_MODEL_ID)
    tokenizer = DistilBertTokenizerFast.from_pretrained(DISTILBERT_BASE_MODEL_ID)

    def tokenize(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            padding="max_length",
            max_length=DISTILBERT_MAX_LENGTH,
        )

    # Convert to HuggingFace Dataset
    hf_train = Dataset.from_pandas(train_df[["text", "label"]])
    hf_val   = Dataset.from_pandas(val_df[["text", "label"]])
    hf_test  = Dataset.from_pandas(test_df[["text", "label"]])

    hf_train = hf_train.map(tokenize, batched=True, remove_columns=["text"])
    hf_val   = hf_val.map(tokenize, batched=True, remove_columns=["text"])
    hf_test  = hf_test.map(tokenize, batched=True, remove_columns=["text"])

    hf_train.set_format("torch")
    hf_val.set_format("torch")
    hf_test.set_format("torch")

    # ── Model ─────────────────────────────────────────────────────────────────
    log.info("Loading model: %s (num_labels=%d)", DISTILBERT_BASE_MODEL_ID, DISTILBERT_NUM_LABELS)
    model = DistilBertForSequenceClassification.from_pretrained(
        DISTILBERT_BASE_MODEL_ID,
        num_labels=DISTILBERT_NUM_LABELS,
    )

    # ── Training Arguments ────────────────────────────────────────────────────
    output_dir = DISTILBERT_MODEL_DIR
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=DISTILBERT_MAX_EPOCHS,
        per_device_train_batch_size=DISTILBERT_BATCH_SIZE,
        per_device_eval_batch_size=DISTILBERT_BATCH_SIZE,
        learning_rate=DISTILBERT_LEARNING_RATE,
        weight_decay=DISTILBERT_WEIGHT_DECAY,
        eval_strategy="steps",
        eval_steps=DISTILBERT_EVAL_STEPS,
        save_strategy="steps",
        save_steps=DISTILBERT_EVAL_STEPS,
        load_best_model_at_end=True,
        metric_for_best_model="roc_auc",
        greater_is_better=True,
        logging_dir=str(Path(output_dir) / "logs"),
        logging_steps=100,
        seed=RANDOM_SEED,
        report_to="none",       # disable wandb / external trackers
        dataloader_num_workers=0,
    )

    # ── Trainer ───────────────────────────────────────────────────────────────
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=hf_train,
        eval_dataset=hf_val,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=DISTILBERT_PATIENCE)],
    )

    log.info("Starting training …")
    train_result = trainer.train()
    log.info("Training complete. Metrics: %s", train_result.metrics)

    # ── Save best model ───────────────────────────────────────────────────────
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    log.info("Best model saved → %s", output_dir)

    # ── Test Set Evaluation ───────────────────────────────────────────────────
    log.info("Evaluating on test set …")
    test_metrics = trainer.evaluate(hf_test)
    log.info("─── Test Set Results ───────────────────────")
    for k, v in test_metrics.items():
        log.info("  %-30s %.4f", k, v)


if __name__ == "__main__":
    train()
