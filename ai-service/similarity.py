"""
similarity.py — Plagiarism detection similarity engine for VaultIQ.

Provides three complementary similarity metrics:
  1. Cosine similarity via TF-IDF (lexical overlap)
  2. Jaccard similarity at word-set level (token overlap)
  3. Semantic similarity via sentence-transformers (meaning overlap)

All heavy models are loaded lazily — never at import time.
The TF-IDF vectorizer is cached to ai-service/models/tfidf.pkl.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, List, Tuple

import joblib
import numpy as np

if TYPE_CHECKING:
    import pandas as pd
    from sklearn.feature_extraction.text import TfidfVectorizer
    from scipy.sparse import csr_matrix

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent / "models"
TFIDF_PKL  = MODELS_DIR / "tfidf.pkl"
TFIDF_MAT  = MODELS_DIR / "tfidf_matrix.pkl"

# ── Module-level singletons (loaded lazily) ───────────────────────────────────
_sentence_model = None  # SentenceTransformer instance
_tfidf_vectorizer = None  # TfidfVectorizer for similarity search
_tfidf_matrix = None  # Pre-computed sparse TF-IDF matrix
_corpus_texts: List[str] = []  # Corpus texts loaded from CSV
_corpus_metadata: dict = {}  # doc_id -> {text, source}


# ── TF-IDF ────────────────────────────────────────────────────────────────────

def build_tfidf_index(
    corpus_df: "pd.DataFrame",
) -> "Tuple[TfidfVectorizer, csr_matrix]":
    """Build or load a TF-IDF index over the reference corpus.

    If ``ai-service/models/tfidf.pkl`` already exists the vectorizer and
    matrix are loaded from disk instead of being rebuilt.

    Args:
        corpus_df: DataFrame with at least a ``text`` column.

    Returns:
        A tuple of (fitted TfidfVectorizer, sparse document-term matrix).
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    if TFIDF_PKL.exists() and TFIDF_MAT.exists():
        logger.info("Loading cached TF-IDF index from disk...")
        vectorizer = joblib.load(TFIDF_PKL)
        matrix     = joblib.load(TFIDF_MAT)
        logger.info("TF-IDF index loaded (%d docs).", matrix.shape[0])
        return vectorizer, matrix

    logger.info("Building TF-IDF index over %d documents...", len(corpus_df))
    from sklearn.feature_extraction.text import TfidfVectorizer as _TFIDF

    texts = corpus_df["text"].fillna("").astype(str).tolist()
    vectorizer = _TFIDF(
        max_features=50_000,
        ngram_range=(1, 2),
        sublinear_tf=True,
        min_df=2,
        strip_accents="unicode",
        analyzer="word",
    )
    matrix = vectorizer.fit_transform(texts)

    joblib.dump(vectorizer, TFIDF_PKL)
    joblib.dump(matrix,     TFIDF_MAT)
    logger.info("TF-IDF index built and cached (%d docs, %d features).",
                matrix.shape[0], matrix.shape[1])
    return vectorizer, matrix


def cosine_similarity_score(
    chunk: str,
    matrix: "csr_matrix",
    vectorizer: "TfidfVectorizer",
) -> float:
    """Compute the maximum cosine similarity between *chunk* and the corpus.

    Args:
        chunk:      A single text chunk to compare against the corpus.
        matrix:     The sparse TF-IDF document-term matrix (n_docs × n_features).
        vectorizer: The fitted TfidfVectorizer used to build *matrix*.

    Returns:
        Maximum cosine similarity score in [0.0, 1.0].
    """
    if not chunk.strip():
        return 0.0

    from sklearn.metrics.pairwise import cosine_similarity as _cos_sim

    chunk_vec = vectorizer.transform([chunk])
    sims      = _cos_sim(chunk_vec, matrix).flatten()
    return float(sims.max()) if len(sims) > 0 else 0.0


# ── Jaccard ───────────────────────────────────────────────────────────────────

def jaccard_similarity_score(
    chunk: str,
    corpus_texts: List[str],
    sample_size: int = 1000,
) -> float:
    """Compute the maximum Jaccard word-set similarity between *chunk* and corpus.

    Only the first *sample_size* documents are examined to keep latency
    acceptable on large corpora.

    Args:
        chunk:        The text chunk to compare.
        corpus_texts: List of reference document strings.
        sample_size:  Maximum number of corpus docs to check.

    Returns:
        Maximum Jaccard score in [0.0, 1.0].
    """
    if not chunk.strip() or not corpus_texts:
        return 0.0

    chunk_words = set(chunk.lower().split())
    if not chunk_words:
        return 0.0

    sample    = corpus_texts[:sample_size]
    best: float = 0.0
    for doc in sample:
        doc_words = set(doc.lower().split())
        if not doc_words:
            continue
        intersection = len(chunk_words & doc_words)
        union        = len(chunk_words | doc_words)
        score        = intersection / union if union > 0 else 0.0
        if score > best:
            best = score
            if best >= 0.99:   # early-exit if near-duplicate found
                break
    return best


# ── Semantic (sentence-transformers) ──────────────────────────────────────────

def _get_sentence_model():
    """Lazily load and cache the sentence-transformer model.

    Returns:
        A loaded SentenceTransformer instance.

    Raises:
        ImportError: If sentence-transformers is not installed.
    """
    global _sentence_model
    if _sentence_model is None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise ImportError(
                "sentence-transformers is required for semantic similarity. "
                "Install: pip install sentence-transformers"
            ) from exc
        logger.info("Loading sentence-transformer model (all-MiniLM-L6-v2)...")
        _sentence_model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Sentence-transformer model loaded.")
    return _sentence_model


def semantic_similarity_score(
    chunk: str,
    corpus_sample: List[str],
) -> float:
    """Compute the maximum semantic cosine similarity between *chunk* and a sample.

    Uses all-MiniLM-L6-v2 for fast, high-quality sentence embeddings.

    Args:
        chunk:         The text chunk to compare.
        corpus_sample: A small list of corpus texts to embed and compare against.

    Returns:
        Maximum semantic similarity score in [0.0, 1.0].
    """
    if not chunk.strip() or not corpus_sample:
        return 0.0

    model = _get_sentence_model()

    try:
        chunk_emb  = model.encode([chunk], normalize_embeddings=True)
        corpus_emb = model.encode(corpus_sample, normalize_embeddings=True,
                                  show_progress_bar=False, batch_size=64)

        sims = (chunk_emb @ corpus_emb.T).flatten()
        return float(np.clip(sims.max(), 0.0, 1.0))
    except Exception as exc:
        logger.warning("Semantic similarity failed: %s", exc)
        return 0.0


# ── Corpus Loading (Lazy) ────────────────────────────────────────────────────

def _load_corpus_and_tfidf():
    """Lazily load corpus.csv and TF-IDF models on first use.

    Populates global _corpus_texts, _corpus_metadata, _tfidf_vectorizer, _tfidf_matrix.
    """
    global _corpus_texts, _corpus_metadata, _tfidf_vectorizer, _tfidf_matrix

    if _corpus_texts and _tfidf_vectorizer is not None:
        return  # Already loaded

    # Load corpus CSV
    corpus_csv = Path(__file__).parent / "datasets" / "corpus.csv"
    if not corpus_csv.exists():
        logger.warning("Corpus CSV not found at %s", corpus_csv)
        return

    try:
        import pandas as pd
        df = pd.read_csv(corpus_csv)
        _corpus_texts = df["text"].fillna("").astype(str).tolist()
        _corpus_metadata = {
            row["doc_id"]: {"text": row["text"], "source": row["source"]}
            for _, row in df.iterrows()
        }
        logger.info("Loaded corpus: %d documents", len(_corpus_texts))
    except Exception as exc:
        logger.warning("Failed to load corpus CSV: %s", exc)
        return

    # Load TF-IDF vectorizer and matrix
    _tfidf_vectorizer, _tfidf_matrix = build_tfidf_index(df)


def search(chunk: str) -> Tuple[float, float, float, str]:
    """Search for similar documents in the corpus using 3 similarity metrics.

    Performs lazy loading of corpus and TF-IDF on first call.

    Args:
        chunk: The text chunk to search for in the corpus.

    Returns:
        A 4-tuple: (cosine_score, jaccard_score, semantic_score, matched_text)
        where matched_text is the best-matching corpus excerpt (up to 300 chars).
    """
    if not chunk.strip():
        return 0.0, 0.0, 0.0, ""

    _load_corpus_and_tfidf()

    if not _corpus_texts or _tfidf_vectorizer is None:
        logger.warning("Corpus or TF-IDF index not available for similarity search")
        return 0.0, 0.0, 0.0, ""

    try:
        # 1. Cosine similarity (TF-IDF)
        cosine_score = cosine_similarity_score(chunk, _tfidf_matrix, _tfidf_vectorizer)

        # 2. Jaccard similarity (word-set overlap)
        jaccard_score = jaccard_similarity_score(chunk, _corpus_texts, sample_size=1000)

        # 3. Semantic similarity (sentence-transformers)
        # Sample 100 random documents to keep latency low
        import random
        sample_size = min(100, len(_corpus_texts))
        corpus_sample = random.sample(_corpus_texts, sample_size) if _corpus_texts else []
        semantic_score = semantic_similarity_score(chunk, corpus_sample)

        # Find best-matching text (use cosine for ranking since it's the fastest)
        matched_text = ""
        if cosine_score > 0.1:  # Only report if there's a meaningful match
            try:
                from sklearn.metrics.pairwise import cosine_similarity as _cos_sim
                chunk_vec = _tfidf_vectorizer.transform([chunk])
                sims = _cos_sim(chunk_vec, _tfidf_matrix).flatten()
                best_idx = int(sims.argmax())
                matched_text = _corpus_texts[best_idx][:300]
            except Exception as e:
                logger.debug("Failed to find matched text: %s", e)

        return float(cosine_score), float(jaccard_score), float(semantic_score), matched_text

    except Exception as exc:
        logger.error("Similarity search failed: %s", exc)
        return 0.0, 0.0, 0.0, ""
