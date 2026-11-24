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
    rng = random.Random(f"{SEED}-{split}")
    rows = _candidates(split)
    rng.shuffle(rows)
    return _select_chunks(rows, rng, max_per_class, split)


# ── Extra corpora: formal human writing that HC3 lacks ──────────────────────────
# HC3's human answers are casual (Reddit / Q&A), so a model trained only on HC3 learns
# "formal = AI". These add formal text on BOTH sides of the label.
#   wiki_intro — aadityaubhat/GPT-wiki-intro: real Wikipedia intro vs GPT-3 intro on the
#                SAME title (paired, so topic carries no label signal). Split by title so a
#                pair never straddles splits; titles named in HC3 test questions are dropped.
#   pile       — artem9k/ai-text-detection-pile: human essays (shard 0) vs AI web/news text
#                (shard 6). Split by text hash.
# Split per source: 10% test / 10% val / 80% train, deterministic.
EXTRA_SOURCES = ("wiki_intro", "pile")
WIKI_INTRO_REPO = "aadityaubhat/GPT-wiki-intro"
PILE_REPO = "artem9k/ai-text-detection-pile"


def _hash_split(key: str) -> str:
    bucket = int(hashlib.md5(key.encode()).hexdigest()[:8], 16) % 100
    return "test" if bucket < 10 else "val" if bucket < 20 else "train"


def _snapshot(repo: str, patterns: list[str]) -> Path:
    from huggingface_hub import snapshot_download
    try:
        return Path(snapshot_download(repo, repo_type="dataset", allow_patterns=patterns, local_files_only=True))
    except Exception:
        return Path(snapshot_download(repo, repo_type="dataset", allow_patterns=patterns))


def _hc3_test_terms() -> set[str]:
    """Quoted concept names in HC3 test-domain questions, e.g. 'Please explain what is "X"'."""
    terms: set[str] = set()
    with open(HC3_PATH, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            if rec["source"] in TEST_DOMAINS:
                terms.update(t.strip().lower() for t in re.findall(r'"([^"]+)"', rec["question"]))
    return terms


def _head(text: str, limit: int = 6000) -> str:
    """Keep the leading paragraphs of a long document so clean()'s 8000-char cap accepts it."""
    if len(text) <= limit:
        return text
    cut = text.rfind("\n", 0, limit)
    return text[: cut if cut > limit // 2 else limit]


def _extra_candidates(source: str, split: str, rng: random.Random, per_label: int) -> list[dict]:
    """Up to per_label raw candidates per label for the split (more than needed; cleaning drops some)."""
    rows: list[dict] = []
    if source == "wiki_intro":
        import pandas as pd
        snap = _snapshot(WIKI_INTRO_REPO, ["*.csv.zip"])
        df = pd.read_csv(next(snap.glob("*.csv.zip")), usecols=["title", "wiki_intro", "generated_intro"])
        excluded = _hc3_test_terms()
        df = df[~df.title.str.lower().isin(excluded)]
        df = df[df.title.map(_hash_split) == split]
        df = df.sample(n=min(per_label, len(df)), random_state=rng.randrange(2**31))
        for r in df.itertuples():
            rows.append({"text": str(r.wiki_intro), "label": 0, "source": "wiki_intro_human"})
            rows.append({"text": str(r.generated_intro), "label": 1, "source": "wiki_intro_gpt3"})
    elif source == "pile":
        import pyarrow.parquet as pq
        snap = _snapshot(PILE_REPO, ["data/train-00000-*.parquet", "data/train-00006-*.parquet"])
        for shard, label, name in (("train-00000-", 0, "pile_human_essay"), ("train-00006-", 1, "pile_ai")):
            table = pq.read_table(next((snap / "data").glob(f"{shard}*.parquet")), columns=["text"])
            idx = list(range(table.num_rows))
            rng.shuffle(idx)
            texts = table.column("text").take(idx[: per_label * 12]).to_pylist()  # ~10% land in split
            picked = [t for t in texts if t and _hash_split(t[:300]) == split][:per_label]
            rows += [{"text": _head(t), "label": label, "source": name} for t in picked]
    else:
        raise ValueError(f"unknown extra source {source!r}")
    return rows


def load_extra_chunks(source: str, split: str, max_per_class: int) -> list[dict]:
    """Balanced serving-style chunks from an extra corpus (see EXTRA_SOURCES)."""
    rng = random.Random(f"{SEED}-{source}-{split}")
    rows = _extra_candidates(source, split, rng, per_label=int(max_per_class * 1.6) + 50)
    rng.shuffle(rows)
    return _select_chunks(rows, rng, max_per_class, f"{source}/{split}")


def _select_chunks(rows: list[dict], rng: random.Random, max_per_class: int, tag: str) -> list[dict]:
    """Clean, dedupe and chunk candidate rows; one random serving-style chunk per row, class-balanced."""
    from core.preprocessor import preprocess

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
        try:
            chunks = [c for c in preprocess(text) if len(c) >= 100]
        except ValueError:  # preprocess raises when no sentence survives its cleaning
            continue
        if not chunks:
            continue
        out.append({"text": rng.choice(chunks), "label": r["label"], "source": r["source"]})
        counts[r["label"]] += 1

    n = min(counts.values())
    balanced = [r for r in out if r["label"] == 1][:n] + [r for r in out if r["label"] == 0][:n]
    rng.shuffle(balanced)
    print(f"   {tag}: {n:,} per class ({len(balanced):,} chunks)")
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


def finetuned_roberta_scores(split: str, max_per_class: int, texts: np.ndarray) -> np.ndarray | None:
    """Fine-tuned RoBERTa P(AI) per text, cached per checkpoint; None if no checkpoint is loaded."""
    det = _detector()
    if det._finetuned_roberta is None:
        return None
    weights = max(det.FINETUNED_ROBERTA_PATH.iterdir(), key=lambda p: p.stat().st_mtime)
    tag = hashlib.md5(f"{weights.name}|{weights.stat().st_mtime}".encode()).hexdigest()[:8]
    cache = DS / f"roberta_ft_{split}_{max_per_class}_{tag}.npz"
    if cache.exists():
        return np.load(cache)["r"]
    from tqdm import tqdm

    r = np.array([det.finetuned_roberta_score(t) for t in tqdm(texts, desc=f"roberta_ft[{split}]")],
                 dtype=np.float32)
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
