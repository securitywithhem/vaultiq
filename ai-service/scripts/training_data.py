"""
training_data.py — Shared data pipeline for every training / tuning script.

  python scripts/training_data.py download     # HC3 → datasets/all.jsonl

Splits (HC3, by domain so the test set measures out-of-domain generalisation):
  test  — medicine + wiki_csai, never trained or tuned on
  val   — ~10% of the remaining questions (early stopping, ensemble weights, threshold)
  train — the rest, plus datasets/modern_llm_corpus.csv if present

Each sample is ONE chunk produced by core.preprocessor.preprocess(), and features are
computed by core.detector with GPT-2 loaded — the exact inputs detect() sees at serving time.
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

import numpy as np

AI_SERVICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI_SERVICE))

DS = AI_SERVICE / "datasets"
HC3_PATH = DS / "all.jsonl"
MODERN_CORPUS_PATH = DS / "modern_llm_corpus.csv"
HC3_DOMAINS = ["reddit_eli5", "open_qa", "finance", "wiki_csai", "medicine"]
TEST_DOMAINS = {"medicine", "wiki_csai"}
VAL_PERCENT = 10
SEED = 42

URL_RE = re.compile(r"https?://\S+|www\.\S+")
WS_RE = re.compile(r"\s+")


def clean(raw: str) -> Optional[str]:
    """Length / ASCII / URL / repetition filters; returns the (truncated) text or None."""
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


def download() -> None:
    from huggingface_hub import hf_hub_download

    DS.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(HC3_PATH, "w", encoding="utf-8") as out:
        for domain in HC3_DOMAINS:
            path = hf_hub_download("Hello-SimpleAI/HC3", f"{domain}.jsonl", repo_type="dataset")
            with open(path, encoding="utf-8") as f:
                for line in f:
                    rec = json.loads(line)
                    rec["source"] = domain
                    out.write(json.dumps(rec) + "\n")
                    n += 1
    print(f"✓ {n:,} HC3 questions → {HC3_PATH}")


def _split_of(rec: dict) -> str:
    if rec["source"] in TEST_DOMAINS:
        return "test"
    bucket = int(hashlib.md5(rec["question"].encode()).hexdigest()[:8], 16) % 100
    return "val" if bucket < VAL_PERCENT else "train"


def _candidates(split: str) -> list[dict]:
    if not HC3_PATH.exists():
        raise FileNotFoundError(f"{HC3_PATH} missing — run: python scripts/training_data.py download")
    rows = []
    with open(HC3_PATH, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            if _split_of(rec) != split:
                continue
            for key, label in (("chatgpt_answers", 1), ("human_answers", 0)):
                for ans in rec.get(key) or []:
                    rows.append({"text": ans, "label": label, "source": f"hc3_{rec['source']}"})

    if split == "train" and MODERN_CORPUS_PATH.exists():
        import pandas as pd
        df = pd.read_csv(MODERN_CORPUS_PATH, usecols=["text", "label", "source"]).dropna(subset=["text", "label"])
        rows += [{"text": str(r.text), "label": int(r.label), "source": str(r.source)} for r in df.itertuples()]
    return rows


def load_chunks(split: str, max_per_class: int) -> list[dict]:
    """Balanced rows of {text: one serving-style chunk, label, source} for the split."""
    from core.preprocessor import preprocess

    rng = random.Random(f"{SEED}-{split}")
    rows = _candidates(split)
    rng.shuffle(rows)

    out, seen, counts = [], set(), {0: 0, 1: 0}
    for r in rows:
        if counts[r["label"]] >= max_per_class:
            if min(counts.values()) >= max_per_class:
                break
            continue
        text = clean(r["text"])
        if not text:
            continue
        key = WS_RE.sub(" ", text.lower())[:500]
        if key in seen:
            continue
        seen.add(key)
        chunks = [c for c in preprocess(text) if len(c) >= 100]
        if not chunks:
            continue
        out.append({"text": rng.choice(chunks), "label": r["label"], "source": r["source"]})
        counts[r["label"]] += 1

    n = min(counts.values())
    balanced = [r for r in out if r["label"] == 1][:n] + [r for r in out if r["label"] == 0][:n]
    rng.shuffle(balanced)
    print(f"   {split}: {n:,} per class ({len(balanced):,} chunks)")
    return balanced


_models_loaded = False


def _detector():
    """core.detector with all models loaded (GPT-2 perplexity must match serving)."""
    global _models_loaded
    from core import detector
    if not _models_loaded:
        detector.load_models()
        _models_loaded = True
    return detector


def embedding_tag() -> str:
    """Changes whenever the embedding model changes, so stale feature caches are not reused."""
    from core.detector import EMBEDDING_MODEL_ID
    path = Path(EMBEDDING_MODEL_ID)
    stamp = str(max(p.stat().st_mtime for p in path.iterdir())) if path.is_dir() else ""
    return hashlib.md5(f"{EMBEDDING_MODEL_ID}|{stamp}".encode()).hexdigest()[:8]


def load_features(split: str, max_per_class: int, rebuild: bool = False) -> dict[str, np.ndarray]:
    """{texts, X (n, 25), E (n, emb_dim), y} for the split, cached per embedding model."""
    cache = DS / f"features_{split}_{max_per_class}_{embedding_tag()}.npz"
    if cache.exists() and not rebuild:
        print(f"♻️  {cache.name}")
        return dict(np.load(cache))

    from tqdm import tqdm

    det = _detector()
    rows = load_chunks(split, max_per_class)
    dim = det._semantic_model.get_sentence_embedding_dimension()
    X, E = [], []
    for r in tqdm(rows, desc=f"features[{split}]"):
        X.append(det.build_feature_vector(r["text"]))
        emb = det.encode_document(r["text"])
        E.append(emb if emb is not None else np.zeros(dim))
    data = {
        "texts": np.array([r["text"] for r in rows]),
        "X": np.array(X, dtype=np.float32),
        "E": np.array(E, dtype=np.float32),
        "y": np.array([r["label"] for r in rows], dtype=np.int32),
    }
    np.savez_compressed(cache, **data)
    print(f"💾 {cache.name}")
    return data


def roberta_scores(split: str, max_per_class: int, texts: np.ndarray) -> np.ndarray:
    """Served RoBERTa ensemble score per text (cached; independent of the embedding model)."""
    cache = DS / f"roberta_{split}_{max_per_class}.npz"
    if cache.exists():
        return np.load(cache)["r"]
    from tqdm import tqdm

    det = _detector()
    r = np.array([det.roberta_score(t) for t in tqdm(texts, desc=f"roberta[{split}]")], dtype=np.float32)
    np.savez_compressed(cache, r=r)
    return r


def metrics(y: np.ndarray, prob: np.ndarray, threshold: float = 0.5) -> dict[str, float]:
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score

    pred = (prob >= threshold).astype(int)
    return {
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred)), 4),
        "f1": round(float(f1_score(y, pred)), 4),
        "roc_auc": round(float(roc_auc_score(y, prob)), 4),
    }


if __name__ == "__main__":
    if sys.argv[1:] == ["download"]:
        download()
    else:
        print(__doc__)
