"""
models/plagiarism_model.py — SBERT + FAISS plagiarism detection pipeline.

Responsibilities:
  - Manage the FAISS IndexFlatIP vector index (load/save/add/search)
  - Encode text windows using sentence-transformers all-MiniLM-L6-v2
  - Provide TF-IDF fast pre-filter via scikit-learn
  - Map similarity hits back to source character offsets
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine

from config import (
    CORPUS_METADATA_PATH,
    FAISS_INDEX_PATH,
    PLAGIARISM_SBERT_THRESHOLD,
    PLAGIARISM_TFIDF_THRESHOLD,
    SBERT_EMBEDDING_DIM,
    SBERT_MODEL_ID,
)
from utils.helpers import find_substring_offsets, sentence_windows


class PlagiarismModel:
    """
    SBERT-based plagiarism detection model backed by a FAISS index.

    Each entry in the FAISS index corresponds to one text window.
    Metadata (window text, doc_id, etc.) is stored in a parallel JSON list.
    """

    def __init__(self) -> None:
        self._sbert: Optional[SentenceTransformer] = None
        self._index: Optional[faiss.IndexFlatIP] = None
        # Parallel metadata list: one entry per vector in the FAISS index
        self._metadata: List[Dict] = []
        # TF-IDF vectorizer fitted on corpus for fast pre-filtering
        self._tfidf: TfidfVectorizer = TfidfVectorizer(
            max_features=10_000,
            ngram_range=(1, 2),
        )
        self._tfidf_matrix = None   # set after first fit

    # ─── Startup / Shutdown ────────────────────────────────────────────────────

    def load(self) -> None:
        """
        Load SBERT model and FAISS index from disk.
        Creates a fresh empty FAISS index if no persisted index exists.
        """
        self._sbert = SentenceTransformer(SBERT_MODEL_ID)

        index_path = Path(FAISS_INDEX_PATH)
        metadata_path = Path(CORPUS_METADATA_PATH)

        if index_path.exists() and metadata_path.exists():
            self._index = faiss.read_index(str(index_path))
            with metadata_path.open("r", encoding="utf-8") as fh:
                self._metadata = json.load(fh)
            # Re-fit TF-IDF on existing corpus texts
            corpus_texts = [m["window_text"] for m in self._metadata if m.get("window_text")]
            if corpus_texts:
                self._tfidf_matrix = self._tfidf.fit_transform(corpus_texts)
        else:
            self._index = faiss.IndexFlatIP(SBERT_EMBEDDING_DIM)
            self._metadata = []

    def _persist(self) -> None:
        """Save FAISS index and metadata to disk."""
        Path(FAISS_INDEX_PATH).parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self._index, FAISS_INDEX_PATH)  # type: ignore[arg-type]
        with open(CORPUS_METADATA_PATH, "w", encoding="utf-8") as fh:
            json.dump(self._metadata, fh, ensure_ascii=False, indent=2)

    # ─── Encoding ──────────────────────────────────────────────────────────────

    def _encode(self, texts: List[str]) -> np.ndarray:
        """Encode a list of texts into L2-normalised SBERT embeddings."""
        vectors = self._sbert.encode(  # type: ignore[union-attr]
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.astype(np.float32)

    # ─── Corpus Management ────────────────────────────────────────────────────

    def add_document(self, text: str, doc_id: str, title: str = "") -> None:
        """
        Split a document into sentence windows, encode each window,
        and add to the FAISS index.

        Args:
            text:   Full document text.
            doc_id: Caller-supplied unique identifier.
            title:  Optional document title for metadata.
        """
        from services.preprocessor import preprocess  # local import to avoid circular

        processed = preprocess(text)
        windows = sentence_windows(
            processed.sentences,
            window=5,
            stride=2,
        )
        if not windows:
            return

        window_texts = [" ".join(w) for w in windows]
        vectors = self._encode(window_texts)

        # faiss.normalize_L2 is a no-op here because normalize_embeddings=True
        # in SentenceTransformer, but we normalise again to be safe.
        faiss.normalize_L2(vectors)
        self._index.add(vectors)  # type: ignore[union-attr]

        for wt in window_texts:
            self._metadata.append(
                {
                    "window_text": wt,
                    "doc_id": doc_id,
                    "title": title,
                }
            )

        # Re-fit TF-IDF
        all_texts = [m["window_text"] for m in self._metadata]
        self._tfidf_matrix = self._tfidf.fit_transform(all_texts)

        self._persist()

    # ─── Similarity Search ────────────────────────────────────────────────────

    def _tfidf_prefilter(self, query_text: str) -> bool:
        """
        Fast TF-IDF pre-filter: returns True if any corpus document is
        similar enough to warrant SBERT comparison.
        """
        if self._tfidf_matrix is None:
            return False
        try:
            q_vec = self._tfidf.transform([query_text])
            sims = sk_cosine(q_vec, self._tfidf_matrix).flatten()
            return bool(sims.max() >= PLAGIARISM_TFIDF_THRESHOLD)
        except Exception:
            return True   # fail open — run SBERT anyway

    def search(
        self,
        raw_text: str,
        top_k: int = 5,
    ) -> List[Dict]:
        """
        Search the FAISS corpus for plagiarised windows in *raw_text*.

        Returns a list of hit dicts:
          { text, similarity, matched_doc_id, start_char, end_char }
        """
        if self._index is None or self._index.ntotal == 0:
            return []

        from services.preprocessor import preprocess

        processed = preprocess(raw_text)
        windows = sentence_windows(processed.sentences, window=5, stride=2)
        if not windows:
            return []

        window_texts = [" ".join(w) for w in windows]
        hits: List[Dict] = []

        for wt in window_texts:
            # TF-IDF pre-filter
            if not self._tfidf_prefilter(wt):
                continue

            # SBERT search
            q_vec = self._encode([wt])
            faiss.normalize_L2(q_vec)
            k = min(top_k, self._index.ntotal)
            distances, indices = self._index.search(q_vec, k)  # type: ignore[union-attr]

            for dist, idx in zip(distances[0], indices[0]):
                if idx == -1:
                    continue
                similarity = float(dist)  # inner product of L2-normed = cosine
                if similarity >= PLAGIARISM_SBERT_THRESHOLD:
                    meta = self._metadata[idx]
                    start, end = find_substring_offsets(raw_text, wt)
                    hits.append(
                        {
                            "text": wt,
                            "similarity": similarity,
                            "matched_doc_id": meta["doc_id"],
                            "start_char": max(start, 0),
                            "end_char": max(end, 0),
                        }
                    )

        # Deduplicate by (text, matched_doc_id)
        seen: set = set()
        deduped: List[Dict] = []
        for h in hits:
            key = (h["text"][:80], h["matched_doc_id"])
            if key not in seen:
                seen.add(key)
                deduped.append(h)

        return deduped

    def window_count(self, raw_text: str) -> int:
        """Return the total number of windows for a given text."""
        from services.preprocessor import preprocess

        processed = preprocess(raw_text)
        return len(sentence_windows(processed.sentences, window=5, stride=2))

    @property
    def is_empty(self) -> bool:
        """True if the FAISS index has no vectors."""
        return self._index is None or self._index.ntotal == 0
