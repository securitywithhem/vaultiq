"""
Ensemble optimization — find the blend weight that maximizes F1 on a
held-out set, using RoBERTa + the new LR pipeline.

Produces:
  models/ensemble_config.json   — {"w_roberta": float, "w_lr": float, "threshold": float}

The detector.py is updated (separately) to read this config at startup.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import joblib
import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer

sys.path.insert(0, str(Path(__file__).parent.parent))
from core.detector import extract_features  # noqa: E402

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

ROBERTA_NAME = "roberta-base-openai-detector"
EVAL_PER_CLASS = 1000            # 1k human + 1k AI
MAX_TEXT_LEN = 4000              # pre-tokenization char cap
BATCH_SIZE = 8


def load_eval_set(path: Path, per_class: int) -> list[tuple[int, str]]:
    """Sample balanced HC3 records for ensemble eval."""
    print(f"📂 Sampling {per_class:,} per class from {path.name}...")
    humans, ais = [], []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            for h in r.get("human_answers", []) or []:
                if h and 200 <= len(h) <= MAX_TEXT_LEN:
                    humans.append(h)
            for a in r.get("chatgpt_answers", []) or []:
                if a and 200 <= len(a) <= MAX_TEXT_LEN:
                    ais.append(a)
    random.shuffle(humans)
    random.shuffle(ais)
    humans = humans[:per_class]
    ais = ais[:per_class]
    samples = [(0, t) for t in humans] + [(1, t) for t in ais]
    random.shuffle(samples)
    print(f"   ✓ {len(samples):,} samples ({len(humans)} human, {len(ais)} AI)")
    return samples


def score_lr(texts: list[str], pipeline) -> np.ndarray:
    print(f"🔧 Scoring {len(texts):,} with LR pipeline...")
    X = np.zeros((len(texts), 13), dtype=np.float32)
    for i, t in enumerate(texts):
        try:
            X[i] = extract_features(t)
        except Exception:
            pass
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    return pipeline.predict_proba(X)[:, 1]


def score_roberta(texts: list[str], tokenizer, model) -> np.ndarray:
    print(f"🤖 Scoring {len(texts):,} with RoBERTa (batched)...")
    model.eval()
    scores = np.zeros(len(texts), dtype=np.float32)
    with torch.no_grad():
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            enc = tokenizer(batch, return_tensors="pt", truncation=True, padding=True, max_length=512)
            logits = model(**enc).logits
            probs = torch.softmax(logits, dim=-1)
            # id2label = {0: 'Fake', 1: 'Real'} — index 0 is AI-generated probability
            scores[i : i + len(batch)] = probs[:, 0].cpu().numpy()
            if (i // BATCH_SIZE) % 20 == 0:
                print(f"   {i + len(batch):,}/{len(texts):,}", end="\r", flush=True)
    print(f"   ✓ done ({len(texts):,})" + " " * 20)
    return scores


def eval_blend(r: np.ndarray, l: np.ndarray, y: np.ndarray, w_r: float, thr: float = 0.5) -> dict:
    ens = w_r * r + (1 - w_r) * l
    pred = (ens >= thr).astype(int)
    return {
        "w_roberta": w_r,
        "threshold": thr,
        "accuracy": accuracy_score(y, pred),
        "precision": precision_score(y, pred, zero_division=0),
        "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
        "roc_auc": roc_auc_score(y, ens),
    }


def main():
    root = Path(__file__).resolve().parent.parent
    models_dir = root / "models"

    print("=" * 72)
    print("  ENSEMBLE OPTIMIZATION — RoBERTa + LR blend weight tuning")
    print("=" * 72)

    # Load pipeline
    cal_path = models_dir / "lr_model_calibrated.pkl"
    print(f"📦 Loading LR pipeline: {cal_path.name}")
    pipeline = joblib.load(cal_path)

    # Load RoBERTa
    print(f"📦 Loading RoBERTa: {ROBERTA_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(ROBERTA_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(ROBERTA_NAME)
    print("   ✓ loaded")

    # Sample eval set
    samples = load_eval_set(root / "datasets" / "all.jsonl", EVAL_PER_CLASS)
    y = np.array([s[0] for s in samples], dtype=np.int32)
    texts = [s[1] for s in samples]

    # Score with each (with disk cache keyed on the sampled texts)
    cache_path = models_dir / "ensemble_eval_cache.npz"
    texts_hash = int(hash(tuple(t[:200] for t in texts)) & 0xFFFFFFFF)
    if cache_path.exists():
        c = np.load(cache_path, allow_pickle=True)
        if int(c["hash"]) == texts_hash:
            print(f"♻️  Loading cached scores from {cache_path.name}")
            r_scores = c["r"]
            l_scores = c["l"]
        else:
            r_scores = score_roberta(texts, tokenizer, model)
            l_scores = score_lr(texts, pipeline)
            np.savez_compressed(cache_path, r=r_scores, l=l_scores, y=y, hash=texts_hash)
    else:
        r_scores = score_roberta(texts, tokenizer, model)
        l_scores = score_lr(texts, pipeline)
        np.savez_compressed(cache_path, r=r_scores, l=l_scores, y=y, hash=texts_hash)

    # Individual performance
    print("\n" + "=" * 72)
    print("  INDIVIDUAL SCORER PERFORMANCE")
    print("=" * 72)
    for name, s in [("RoBERTa only", r_scores), ("LR only", l_scores)]:
        pred = (s >= 0.5).astype(int)
        print(
            f"  {name:15s} acc={accuracy_score(y, pred):.4f} "
            f"f1={f1_score(y, pred):.4f} auc={roc_auc_score(y, s):.4f}"
        )

    # Grid search
    print("\n" + "=" * 72)
    print("  BLEND WEIGHT GRID SEARCH  (w_roberta, thr=0.5)")
    print("=" * 72)
    print(f"  {'w_roberta':>10s}  {'acc':>7s}  {'prec':>7s}  {'rec':>7s}  {'f1':>7s}  {'auc':>7s}")
    results = []
    for w in np.arange(0.0, 1.01, 0.05):
        m = eval_blend(r_scores, l_scores, y, float(w))
        results.append(m)
        print(
            f"  {w:>10.2f}  {m['accuracy']:>7.4f}  {m['precision']:>7.4f}  "
            f"{m['recall']:>7.4f}  {m['f1']:>7.4f}  {m['roc_auc']:>7.4f}"
        )

    # Best by F1
    best = max(results, key=lambda r: r["f1"])
    print(f"\n🏆 Best blend by F1:  w_roberta={best['w_roberta']:.2f}  "
          f"acc={best['accuracy']:.4f} f1={best['f1']:.4f}")

    # Fine threshold sweep at best blend
    best_w = best["w_roberta"]
    print(f"\n🎯 Threshold sweep at w_roberta={best_w:.2f}:")
    ens = best_w * r_scores + (1 - best_w) * l_scores
    best_thr = 0.5
    best_f1 = 0.0
    for thr in np.arange(0.20, 0.81, 0.02):
        pred = (ens >= thr).astype(int)
        f1 = f1_score(y, pred)
        if f1 > best_f1:
            best_f1 = f1
            best_thr = float(thr)
    best_tuned = eval_blend(r_scores, l_scores, y, best_w, best_thr)
    print(f"  best threshold: {best_thr:.3f}  f1={best_tuned['f1']:.4f}  acc={best_tuned['accuracy']:.4f}")

    # Write config
    out = {
        "w_roberta": best_w,
        "w_lr": round(1.0 - best_w, 4),
        "threshold": best_thr,
        "eval_samples": int(len(samples)),
        "individual": {
            "roberta_only": {
                "accuracy": float(accuracy_score(y, (r_scores >= 0.5).astype(int))),
                "f1": float(f1_score(y, (r_scores >= 0.5).astype(int))),
                "auc": float(roc_auc_score(y, r_scores)),
            },
            "lr_only": {
                "accuracy": float(accuracy_score(y, (l_scores >= 0.5).astype(int))),
                "f1": float(f1_score(y, (l_scores >= 0.5).astype(int))),
                "auc": float(roc_auc_score(y, l_scores)),
            },
        },
        "ensemble_tuned": {k: float(v) if isinstance(v, (int, float, np.floating, np.integer)) else v
                           for k, v in best_tuned.items()},
    }
    config_path = models_dir / "ensemble_config.json"
    with open(config_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\n💾 Saved: {config_path}")
    print(f"   → RoBERTa weight: {best_w:.3f},  LR weight: {1-best_w:.3f},  threshold: {best_thr:.3f}")


if __name__ == "__main__":
    main()
