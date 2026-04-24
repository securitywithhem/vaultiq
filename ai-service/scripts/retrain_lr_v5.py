"""
retrain_lr_v5.py — Fast retraining of LR model on modern LLM data.

Uses the pre-built modern_llm_corpus.csv but DOES NOT call GPT-2 for perplexity
(too slow for 50k+ samples). Uses word-length variance as perplexity proxy,
which is consistent with how inference runs when GPT-2 is not available.

Training data:
  - AI: artem9k/ai-text-detection-pile AI subset + HC3 ChatGPT answers
  - Human: artem9k/ai-text-detection-pile human subset + HC3 human answers
    + arxiv abstracts (academic human writing)
"""

import json
import os
import random
import re
import sys
from collections import Counter
from pathlib import Path
from typing import List, Dict, Optional

import joblib
import numpy as np
import pandas as pd
from tqdm import tqdm
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler

sys.path.insert(0, str(Path(__file__).parent.parent))
from core.detector import extract_features  # noqa: E402

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

DS = Path(__file__).parent.parent / "datasets"
MODELS = Path(__file__).parent.parent / "models"
CACHE = DS / "features_v5_fast.npz"

# ─── Cleaning ─────────────────────────────────────────────────
URL_RE = re.compile(r"https?://\S+|www\.\S+")
WS_RE  = re.compile(r"\s+")

def clean(raw: str) -> Optional[str]:
    if not raw: return None
    t = raw.strip()
    if not (150 <= len(t) <= 8000): return None
    ascii_r = sum(1 for c in t if ord(c) < 128) / len(t)
    if ascii_r < 0.85: return None
    url_chars = sum(len(m.group()) for m in URL_RE.finditer(t))
    if url_chars / len(t) > 0.20: return None
    words = t.split()
    if len(words) < 30: return None
    lw = [w.lower() for w in words]
    if len(set(lw)) < 25: return None
    if max(Counter(lw).values()) / len(words) > 0.25: return None
    return t[:6000]

# ─── Loaders ──────────────────────────────────────────────────
def load_modern_corpus(path: Path, n_ai: int, n_human: int) -> List[Dict]:
    """Load balanced AI + Human from the pre-built modern corpus CSV."""
    print(f"📂 modern_llm_corpus.csv  AI={n_ai:,}  Human={n_human:,}")
    df = pd.read_csv(path, usecols=["text", "label", "source"])
    df = df.dropna(subset=["text", "label"])

    ai_df    = df[df["label"] == 1].sample(n=min(n_ai,    len(df[df["label"]==1])), random_state=SEED)
    human_df = df[df["label"] == 0].sample(n=min(n_human, len(df[df["label"]==0])), random_state=SEED)

    rows = []
    for _, row in pd.concat([ai_df, human_df]).iterrows():
        c = clean(str(row["text"]))
        if c:
            rows.append({"text": c, "label": int(row["label"]), "source": str(row["source"])})
    print(f"   ✓ kept {len(rows):,} samples")
    return rows

def load_arxiv_human(path: Path, limit: int) -> List[Dict]:
    """Load human academic abstracts from arxiv snapshot."""
    print(f"📂 arxiv human abstracts  limit={limit:,}")
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if len(rows) >= limit: break
            try:
                d = json.loads(line)
                c = clean(d.get("abstract", ""))
                if c:
                    rows.append({"text": c, "label": 0, "source": "arxiv_human"})
            except Exception:
                continue
    print(f"   ✓ kept {len(rows):,} samples")
    return rows

def load_hc3_local(path: Path) -> List[Dict]:
    """Parse HC3 all.jsonl for human + ChatGPT answers."""
    print(f"📂 HC3 {path.name}")
    rows = []
    if not path.exists():
        print("   ⚠ not found, skipping")
        return rows
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            for ans in rec.get("chatgpt_answers", []) or []:
                c = clean(ans)
                if c: rows.append({"text": c, "label": 1, "source": "hc3_chatgpt"})
            for ans in rec.get("human_answers", []) or []:
                c = clean(ans)
                if c: rows.append({"text": c, "label": 0, "source": "hc3_human"})
    ai_n   = sum(1 for r in rows if r["label"] == 1)
    hum_n  = sum(1 for r in rows if r["label"] == 0)
    print(f"   ✓ AI={ai_n:,}  Human={hum_n:,}")
    return rows

# ─── Feature extraction (no GPT-2) ────────────────────────────
def extract_matrix_fast(rows: List[Dict]) -> np.ndarray:
    """
    Extract features WITHOUT calling GPT-2 (too slow at scale).
    GPT-2 is unavailable at extract_features call time since we're not
    calling load_models() here. The fallback word-length-variance proxy
    is used for feature 0, which keeps training/inference consistent
    when the service runs in resource-constrained environments.
    """
    print(f"🧪 Extracting {len(rows):,} features (fast, no GPT-2 perplexity)…")
    X = []
    for r in tqdm(rows, desc="Features"):
        X.append(extract_features(r["text"]))   # GPT-2 models are None → uses fallback
    return np.array(X, dtype=np.float32)

# ─── Main ─────────────────────────────────────────────────────
def main():
    os.makedirs(MODELS, exist_ok=True)

    # ── 1. Load data ──
    if CACHE.exists():
        print(f"♻️  Loading feature cache {CACHE.name}")
        c  = np.load(CACHE, allow_pickle=True)
        X, y = c["X"], c["y"]
        print(f"   ✓ {len(X):,} samples  class balance: {dict(zip(*np.unique(y, return_counts=True)))}")
    else:
        rows: List[Dict] = []

        # Modern AI + Human from the pile corpus
        rows += load_modern_corpus(DS / "modern_llm_corpus.csv", n_ai=25000, n_human=25000)

        # HC3 (human vs ChatGPT paired)
        rows += load_hc3_local(DS / "all.jsonl")

        # ArXiv academic human (to prevent false-positives on academic writing)
        arxiv_path = DS / "arxiv-metadata-oai-snapshot.json"
        if arxiv_path.exists():
            rows += load_arxiv_human(arxiv_path, limit=15000)
        else:
            print("⚠  arxiv snapshot not found — model may have higher FP on academic text")

        # Deduplicate
        seen, uniq = set(), []
        for r in rows:
            k = hash(WS_RE.sub(" ", r["text"].lower())[:500].strip())
            if k not in seen:
                seen.add(k)
                uniq.append(r)
        rows = uniq

        # Balance
        ai    = [r for r in rows if r["label"] == 1]
        human = [r for r in rows if r["label"] == 0]
        n     = min(len(ai), len(human))
        print(f"\n⚖️  AI={len(ai):,}  Human={len(human):,} → balancing to {n:,} each")
        rows = random.sample(ai, n) + random.sample(human, n)
        random.shuffle(rows)

        X = extract_matrix_fast(rows)
        y = np.array([r["label"] for r in rows], dtype=np.int32)

        print(f"💾 Saving cache → {CACHE.name}")
        np.savez_compressed(CACHE, X=X, y=y)

    # ── 2. Train / test split ──
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.15, stratify=y, random_state=SEED
    )
    print(f"\n📐 Train={len(X_tr):,}  Test={len(X_te):,}")

    # ── 3. Pipeline ──
    print("\n⚙️  Training HistGradientBoostingClassifier…")
    clf_params = dict(
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
    pipe = Pipeline([("scaler", RobustScaler()), ("clf", HistGradientBoostingClassifier(**clf_params))])
    pipe.fit(X_tr, y_tr)
    print(f"   ✓ iterations used: {pipe.named_steps['clf'].n_iter_}")

    # ── 4. Calibrate ──
    print("🔧 Calibrating (isotonic, cv=5)…")
    cal_pipe = Pipeline([("scaler", RobustScaler()), ("clf", HistGradientBoostingClassifier(**clf_params))])
    cal = CalibratedClassifierCV(cal_pipe, method="isotonic", cv=5)
    cal.fit(X_tr, y_tr)

    # ── 5. Evaluate ──
    y_pred = cal.predict(X_te)
    y_prob = cal.predict_proba(X_te)[:, 1]
    acc = accuracy_score(y_te, y_pred)
    f1  = f1_score(y_te, y_pred)
    auc = roc_auc_score(y_te, y_prob)
    print(f"\n📊 Test (calibrated, thr=0.5):  acc={acc:.4f}  f1={f1:.4f}  AUC={auc:.4f}")

    # ── 6. Save ──
    print("\n💾 Saving models…")
    joblib.dump(pipe, MODELS / "lr_model.pkl")
    joblib.dump(cal,  MODELS / "lr_model_calibrated.pkl")
    # Legacy no-op scaler
    dummy = StandardScaler()
    dummy.fit(np.zeros((2, 13)))
    joblib.dump(dummy, MODELS / "scaler.pkl")

    metrics = {"accuracy": acc, "f1": f1, "roc_auc": auc,
               "n_train": int(len(X_tr)), "n_test": int(len(X_te)),
               "model": "v5_modern_llm_fast", "clf_params": clf_params}
    with open(MODELS / "training_metrics_v5.json", "w") as f:
        json.dump(metrics, f, indent=2)

    print("\n✅ Retraining complete!")
    print(f"   Accuracy={acc:.4f}  F1={f1:.4f}  AUC={auc:.4f}")


if __name__ == "__main__":
    main()
