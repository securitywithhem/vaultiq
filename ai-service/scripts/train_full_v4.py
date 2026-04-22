"""
Train v4 — use ALL available datasets (excluding verified duplicates),
apply explicit impurity/outlier cleaning rules, then train
Pipeline(RobustScaler + HistGradientBoostingClassifier) with calibration.

Data sources (with rationale printed at runtime):
  1. HC3 all.jsonl            — paired human / ChatGPT answers
  2. Kaggle unified CSV       — large pre-labeled mix (gpt2/webtext/corpus)
  3. PubMedQA + pqa_* (3)     — deduped by pubid, scientific human writing
  4. arxiv metadata           — reservoir-sampled human abstracts (non-medical)
Excluded (as duplicates of all.jsonl):
  finance/medicine/open_qa/reddit_eli5/wiki_csai .jsonl
"""

from __future__ import annotations

import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler

sys.path.insert(0, str(Path(__file__).parent.parent))
from core.detector import extract_features  # noqa: E402

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

# ─── Cleaning rules ────────────────────────────────────────────
MIN_LEN = 80
MAX_LEN_RAW = 12_000     # drop texts longer than this
MAX_LEN_TRUNC = 6_000    # truncate kept texts to this
MIN_UNIQUE_WORDS = 15
MIN_ASCII_RATIO = 0.70
MAX_URL_RATIO = 0.40
MAX_TOP_WORD_RATIO = 0.30  # single word ≤ 30% of total

URL_RE = re.compile(r"https?://\S+|www\.\S+")
WS_RE = re.compile(r"\s+")

# ─── Sampling targets (per source, before cleaning/balance) ─────
TARGETS = {
    "kaggle_per_class": 100_000,
    "pubmed_total": 60_000,
    "arxiv_total": 40_000,
}


# ──────────────────────────────────────────────────────────────
# Cleaning
# ──────────────────────────────────────────────────────────────
def clean_text(raw: str) -> str | None:
    """Return cleaned/truncated text or None to drop."""
    if not raw:
        return None
    t = raw.strip()
    if len(t) < MIN_LEN or len(t) > MAX_LEN_RAW:
        return None

    # ASCII ratio
    ascii_count = sum(1 for c in t if ord(c) < 128)
    if ascii_count / len(t) < MIN_ASCII_RATIO:
        return None

    # URL density
    url_chars = sum(len(m.group()) for m in URL_RE.finditer(t))
    if url_chars / len(t) > MAX_URL_RATIO:
        return None

    # Unique words + top-word ratio
    words = t.split()
    if len(words) < 20:
        return None
    lower_words = [w.lower() for w in words]
    uniq = set(lower_words)
    if len(uniq) < MIN_UNIQUE_WORDS:
        return None
    top_count = max(Counter(lower_words).values())
    if top_count / len(words) > MAX_TOP_WORD_RATIO:
        return None

    # Truncate to MAX_LEN_TRUNC
    if len(t) > MAX_LEN_TRUNC:
        t = t[:MAX_LEN_TRUNC]

    return t


def norm_key(text: str) -> int:
    """Dedupe key: lowercase + whitespace-collapsed first 500 chars."""
    s = WS_RE.sub(" ", text.lower())[:500].strip()
    return hash(s)


# ──────────────────────────────────────────────────────────────
# Loaders
# ──────────────────────────────────────────────────────────────
def load_hc3(path: Path) -> list[dict]:
    print(f"📂 HC3: {path.name}")
    raw_h = raw_a = kept_h = kept_a = 0
    out: list[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            for h in r.get("human_answers", []) or []:
                raw_h += 1
                c = clean_text(h)
                if c:
                    out.append({"text": c, "label": 0, "source": "hc3"})
                    kept_h += 1
            for a in r.get("chatgpt_answers", []) or []:
                raw_a += 1
                c = clean_text(a)
                if c:
                    out.append({"text": c, "label": 1, "source": "hc3"})
                    kept_a += 1
    print(f"   human: {kept_h:,}/{raw_h:,}   AI: {kept_a:,}/{raw_a:,}")
    return out


def load_kaggle(path: Path, per_class: int) -> list[dict]:
    print(f"📂 Kaggle: {path.name}")
    df = pd.read_csv(path)
    df = df.dropna(subset=["text", "label"])
    df["text"] = df["text"].astype(str)

    # Class-stratified sample BEFORE cleaning (to save memory/time)
    human = df[df["label"] == 0].sample(
        n=min(per_class, (df["label"] == 0).sum()), random_state=SEED
    )
    ai = df[df["label"] == 1].sample(
        n=min(per_class, (df["label"] == 1).sum()), random_state=SEED
    )

    out: list[dict] = []
    kept_h = kept_a = 0
    for _, row in pd.concat([human, ai]).iterrows():
        c = clean_text(row["text"])
        if not c:
            continue
        label = int(row["label"])
        out.append(
            {"text": c, "label": label, "source": f"kaggle_{row.get('source', 'unk')}"}
        )
        if label == 0:
            kept_h += 1
        else:
            kept_a += 1
    print(f"   human: {kept_h:,}/{len(human):,}   AI: {kept_a:,}/{len(ai):,}")
    return out


def load_pubmed_combined(paths: list[Path], limit: int) -> list[dict]:
    print(f"📂 PubMedQA (combined {len(paths)} parquets, dedupe by pubid)")
    frames = []
    for p in paths:
        if not p.exists():
            continue
        df = pd.read_parquet(p, columns=["pubid", "long_answer"])
        df = df.dropna(subset=["long_answer"])
        df["src"] = p.parent.name
        frames.append(df)
    big = pd.concat(frames, ignore_index=True)
    before = len(big)
    big = big.drop_duplicates(subset=["pubid"])
    print(f"   rows: {before:,} → {len(big):,} (dedup by pubid)")

    if len(big) > limit:
        big = big.sample(n=limit, random_state=SEED)

    out: list[dict] = []
    for _, row in big.iterrows():
        c = clean_text(row["long_answer"])
        if c:
            out.append({"text": c, "label": 0, "source": f"pubmed_{row['src']}"})
    print(f"   kept after cleaning: {len(out):,}/{len(big):,}")
    return out


def load_arxiv(path: Path, limit: int) -> list[dict]:
    """Reservoir-sample `limit` abstracts from the streaming JSONL."""
    print(f"📂 arxiv (reservoir sample of {limit:,} from ~2M)")
    rng = random.Random(SEED)
    reservoir: list[str] = []
    seen = 0
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            ab = r.get("abstract")
            if not ab:
                continue
            seen += 1
            if len(reservoir) < limit:
                reservoir.append(ab)
            else:
                k = rng.randrange(seen)
                if k < limit:
                    reservoir[k] = ab
            if seen % 500_000 == 0:
                print(f"   scanned {seen:,}...", end="\r")

    out: list[dict] = []
    for ab in reservoir:
        c = clean_text(ab)
        if c:
            out.append({"text": c, "label": 0, "source": "arxiv"})
    print(f"   scanned: {seen:,}   reservoir: {len(reservoir):,}   kept: {len(out):,}")
    return out


# ──────────────────────────────────────────────────────────────
# Pipeline utilities
# ──────────────────────────────────────────────────────────────
def dedupe(rows: list[dict]) -> list[dict]:
    print("🧹 Deduplicating by normalized-text hash...")
    seen: set[int] = set()
    out = []
    for r in rows:
        k = norm_key(r["text"])
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    print(f"   ✓ {len(rows):,} → {len(out):,}  (removed {len(rows) - len(out):,})")
    return out


def balance(rows: list[dict]) -> list[dict]:
    print("⚖️  Balancing classes...")
    h = [r for r in rows if r["label"] == 0]
    a = [r for r in rows if r["label"] == 1]
    n = min(len(h), len(a))
    random.shuffle(h)
    random.shuffle(a)
    out = h[:n] + a[:n]
    random.shuffle(out)
    print(f"   before: {len(h):,} H / {len(a):,} AI")
    print(f"   after:  {n:,} H / {n:,} AI  (total {len(out):,})")
    return out


def sanitize_features(X: np.ndarray) -> np.ndarray:
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    lo = np.percentile(X, 1, axis=0)
    hi = np.percentile(X, 99, axis=0)
    return np.clip(X, lo, hi).astype(np.float32)


def extract_matrix(texts: list[str]) -> np.ndarray:
    print(f"🔧 Extracting features for {len(texts):,} samples...")
    n = len(texts)
    X = np.zeros((n, 13), dtype=np.float32)
    for i, t in enumerate(texts):
        try:
            X[i] = extract_features(t)
        except Exception:
            pass
        if (i + 1) % 5000 == 0:
            print(f"   {i + 1:,}/{n:,}", end="\r", flush=True)
    print(f"   ✓ done ({n:,})" + " " * 30)
    return X


def evaluate(name: str, model, X: np.ndarray, y: np.ndarray, thr: float = 0.5) -> dict:
    proba = model.predict_proba(X)[:, 1]
    pred = (proba >= thr).astype(int)
    m = {
        "threshold": thr,
        "accuracy": accuracy_score(y, pred),
        "precision": precision_score(y, pred, zero_division=0),
        "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
        "roc_auc": roc_auc_score(y, proba),
    }
    print(f"\n📊 {name}  (thr={thr:.3f})")
    for k, v in m.items():
        if k == "threshold":
            continue
        print(f"   {k:10s}: {v:.4f}")
    cm = confusion_matrix(y, pred)
    print("   confusion:")
    print(f"       pred: human     ai")
    print(f"    actual human   {cm[0,0]:6d} {cm[0,1]:6d}")
    print(f"    actual ai      {cm[1,0]:6d} {cm[1,1]:6d}")
    return m


def best_thr(model, X_val, y_val) -> float:
    proba = model.predict_proba(X_val)[:, 1]
    prec, rec, thrs = precision_recall_curve(y_val, proba)
    f1s = 2 * prec[:-1] * rec[:-1] / (prec[:-1] + rec[:-1] + 1e-12)
    return float(thrs[int(np.argmax(f1s))])


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────
def main():
    root = Path(__file__).resolve().parent.parent
    ds = root / "datasets"
    models_dir = root / "models"
    models_dir.mkdir(exist_ok=True)
    cache_path = models_dir / "feature_cache_v4.npz"

    print("=" * 72)
    print("  TRAIN v4 — ALL DATASETS, with cleaning + outlier removal")
    print("=" * 72)

    # ── Report plan ────────────────────────────────────────────
    print("""
DATASETS USED (and why):
  1. HC3 all.jsonl              — paired human/ChatGPT answers (best signal)
  2. Kaggle unified CSV         — large labeled mix (gpt2+webtext+corpus)
  3. PubMedQA 3 parquets        — human medical, deduped by pubid
  4. arxiv metadata             — human scientific, reservoir-sampled

DATASETS SKIPPED (verified duplicates of all.jsonl):
  finance / medicine / open_qa / reddit_eli5 / wiki_csai .jsonl

CLEANING RULES: 80≤len≤12000, ASCII≥70%, uniq_words≥15,
  url_ratio<40%, top_word<30%, dedupe by normalized-500-char hash.
""")

    if cache_path.exists():
        print(f"♻️  Loading cached features from {cache_path.name}")
        c = np.load(cache_path, allow_pickle=True)
        X, y, sources_arr = c["X"], c["y"], c["sources"]
        sources = Counter(sources_arr.tolist())
        print(f"   ✓ {len(X):,} samples")
    else:
        rows: list[dict] = []

        p = ds / "all.jsonl"
        if p.exists():
            rows += load_hc3(p)

        p = ds / "kaggle_unified_dataset.csv"
        if p.exists():
            rows += load_kaggle(p, TARGETS["kaggle_per_class"])

        rows += load_pubmed_combined(
            [
                ds / "PubMedQA" / "train-00000-of-00001.parquet",
                ds / "pqa_unlabeled" / "train-00000-of-00001.parquet",
                ds / "pqa_labeled" / "train-00000-of-00001 (1).parquet",
            ],
            TARGETS["pubmed_total"],
        )

        p = ds / "arxiv-metadata-oai-snapshot.json"
        if p.exists():
            rows += load_arxiv(p, TARGETS["arxiv_total"])

        sources = Counter(r["source"] for r in rows)
        print(f"\n📊 Combined after cleaning: {len(rows):,} rows")
        for s, c in sources.most_common():
            print(f"   {s:30s}: {c:,}")

        rows = dedupe(rows)
        rows = balance(rows)
        sources = Counter(r["source"] for r in rows)

        texts = [r["text"] for r in rows]
        y = np.array([r["label"] for r in rows], dtype=np.int32)
        sources_arr = np.array([r["source"] for r in rows])

        X = extract_matrix(texts)

        print(f"💾 Caching features → {cache_path.name}")
        np.savez_compressed(cache_path, X=X, y=y, sources=sources_arr)

    X = sanitize_features(X)

    print("\n✂️  Stratified split 70/15/15...")
    X_trv, X_te, y_trv, y_te = train_test_split(
        X, y, test_size=0.15, stratify=y, random_state=SEED
    )
    X_tr, X_val, y_tr, y_val = train_test_split(
        X_trv, y_trv, test_size=0.1765, stratify=y_trv, random_state=SEED
    )
    print(f"   train: {len(X_tr):,}   val: {len(X_val):,}   test: {len(X_te):,}")

    print("\n⚙️  Training Pipeline(RobustScaler + HistGradientBoostingClassifier)...")
    gb_kwargs = dict(
        max_iter=500,
        learning_rate=0.07,
        max_depth=8,
        min_samples_leaf=40,
        l2_regularization=0.5,
        random_state=SEED,
        class_weight="balanced",
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=20,
    )
    pipeline = Pipeline(
        [("scaler", RobustScaler()), ("clf", HistGradientBoostingClassifier(**gb_kwargs))]
    )
    pipeline.fit(X_tr, y_tr)
    print(f"   ✓ boosting iterations: {pipeline.named_steps['clf'].n_iter_}")

    evaluate("Base — TRAIN", pipeline, X_tr, y_tr)
    base_val = evaluate("Base — VAL", pipeline, X_val, y_val)
    base_test = evaluate("Base — TEST (thr=0.5)", pipeline, X_te, y_te)
    bt = best_thr(pipeline, X_val, y_val)
    print(f"\n🎯 Best threshold on VAL: {bt:.3f}")
    tuned_test = evaluate("Base — TEST (tuned)", pipeline, X_te, y_te, thr=bt)

    print("\n🔧 Calibrating (isotonic, 5-fold CV on train+val)...")
    cal_pipeline = Pipeline(
        [("scaler", RobustScaler()), ("clf", HistGradientBoostingClassifier(**gb_kwargs))]
    )
    cal = CalibratedClassifierCV(cal_pipeline, method="isotonic", cv=5)
    cal.fit(X_trv, y_trv)
    cal_test = evaluate("Calibrated — TEST (thr=0.5)", cal, X_te, y_te)
    cbt = best_thr(cal, X_val, y_val)
    cal_tuned = evaluate("Calibrated — TEST (tuned)", cal, X_te, y_te, thr=cbt)

    print("\n💾 Saving models...")
    for fname in ["lr_model.pkl", "scaler.pkl", "lr_model_calibrated.pkl"]:
        p = models_dir / fname
        if p.exists():
            (p.with_suffix(p.suffix + ".v3")).write_bytes(p.read_bytes())

    joblib.dump(pipeline, models_dir / "lr_model.pkl")
    joblib.dump(cal, models_dir / "lr_model_calibrated.pkl")
    # no-op scaler for legacy code that still loads it
    noop = StandardScaler()
    noop.fit(np.zeros((2, 13)))
    joblib.dump(noop, models_dir / "scaler.pkl")

    def _default(o):
        if isinstance(o, (np.floating, np.integer)):
            return float(o)
        return str(o)

    metrics = {
        "n_train": int(len(X_tr)),
        "n_val": int(len(X_val)),
        "n_test": int(len(X_te)),
        "class_balance": {"human": int((y == 0).sum()), "ai": int((y == 1).sum())},
        "sources": dict(sources),
        "model": "Pipeline(RobustScaler + HistGradientBoostingClassifier)",
        "hyperparams": gb_kwargs,
        "base_val_thr0.5": base_val,
        "base_test_thr0.5": base_test,
        "base_test_tuned": tuned_test,
        "calibrated_test_thr0.5": cal_test,
        "calibrated_test_tuned": cal_tuned,
        "best_threshold_base": bt,
        "best_threshold_calibrated": cbt,
    }
    with open(models_dir / "training_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=_default)
    with open(models_dir / "decision_threshold.json", "w") as f:
        json.dump(
            {"base": bt, "calibrated": cbt, "note": "F1-max thresholds on validation"},
            f,
            indent=2,
        )

    print("\n" + "=" * 72)
    print("  ✅ TRAINING COMPLETE")
    print("=" * 72)
    print(f"  Base        TEST acc={base_test['accuracy']:.4f}  F1={base_test['f1']:.4f}  AUC={base_test['roc_auc']:.4f}")
    print(f"    tuned     TEST acc={tuned_test['accuracy']:.4f}  F1={tuned_test['f1']:.4f}  (thr={bt:.3f})")
    print(f"  Calibrated  TEST acc={cal_test['accuracy']:.4f}  F1={cal_test['f1']:.4f}  AUC={cal_test['roc_auc']:.4f}")
    print(f"    tuned     TEST acc={cal_tuned['accuracy']:.4f}  F1={cal_tuned['f1']:.4f}  (thr={cbt:.3f})")


if __name__ == "__main__":
    main()
