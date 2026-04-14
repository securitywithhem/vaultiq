"""
statistical.py — Statistical text feature extractor for AI detection.

Computes 8 features per text chunk:
  0: perplexity          — GPT-2 cross-entropy proxy (lazy singleton)
  1: burstiness          — std(sentence_lengths) / mean(sentence_lengths)
  2: type_token_ratio    — unique_words / total_words
  3: avg_sentence_length — mean words per sentence
  4: punctuation_ratio   — punct_chars / total_chars
  5: unique_bigram_ratio — unique bigrams / total bigrams
  6: gunning_fog_index   — via textstat
  7: stopword_ratio      — NLTK stopwords / total words
"""
from __future__ import annotations

import logging
import string
from typing import List

import numpy as np

logger = logging.getLogger(__name__)

# ── GPT-2 lazy singleton ───────────────────────────────────────────────────
_gpt2_tokenizer = None
_gpt2_model = None


def _ensure_gpt2() -> None:
    """Load GPT-2 tokenizer and model on first use; no-op on subsequent calls."""
    global _gpt2_tokenizer, _gpt2_model
    if _gpt2_model is not None:
        return
    from transformers import GPT2LMHeadModel, GPT2TokenizerFast
    logger.info("Loading GPT-2 for perplexity computation (first use)…")
    _gpt2_tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")
    _gpt2_model = GPT2LMHeadModel.from_pretrained("gpt2")
    _gpt2_model.eval()


def _perplexity(text: str) -> float:
    """Return GPT-2 perplexity for *text*. Returns 0.0 on failure."""
    _ensure_gpt2()
    try:
        import torch
        inputs = _gpt2_tokenizer(
            text, return_tensors="pt", truncation=True, max_length=1024
        )
        with torch.no_grad():
            out = _gpt2_model(inputs["input_ids"], labels=inputs["input_ids"])
            return float(torch.exp(out.loss).item())
    except Exception as exc:
        logger.warning("Perplexity failed: %s", exc)
        return 0.0


def _split_sentences(text: str) -> List[str]:
    """Split *text* into sentences on . ! ? boundaries."""
    import re
    parts = re.split(r"[.!?]+", text)
    return [p.strip() for p in parts if p.strip()]


def _bigrams(words: List[str]) -> List[tuple]:
    """Return consecutive (word_i, word_{i+1}) pairs."""
    return [(words[i], words[i + 1]) for i in range(len(words) - 1)]


def extract_features(chunks: List[str]) -> np.ndarray:
    """Extract 8 statistical features for each text chunk.

    Args:
        chunks: List of text strings (e.g. output of preprocessor.preprocess).

    Returns:
        np.ndarray of shape (n_chunks, 8). All values are finite floats.
        An all-zero row is returned for empty / whitespace-only chunks.
    """
    import nltk
    import textstat

    nltk.download("stopwords", quiet=True)
    from nltk.corpus import stopwords as _sw
    stop_words: set = set(_sw.words("english"))

    rows: List[List[float]] = []

    for text in chunks:
        if not text or not text.strip():
            rows.append([0.0] * 8)
            continue

        words = text.split()
        total_words = len(words)
        total_chars = len(text)
        sentences = _split_sentences(text)

        # 0 — perplexity
        perplexity = _perplexity(text)

        # 1 — burstiness
        if len(sentences) > 1:
            lens = [len(s.split()) for s in sentences]
            mean_l = float(np.mean(lens))
            burstiness = float(np.std(lens)) / mean_l if mean_l > 0 else 0.0
        else:
            burstiness = 0.0

        # 2 — type-token ratio
        ttr = (
            len({w.lower() for w in words}) / total_words if total_words else 0.0
        )

        # 3 — avg sentence length
        avg_sent_len = (
            float(np.mean([len(s.split()) for s in sentences])) if sentences else 0.0
        )

        # 4 — punctuation ratio
        punct_ratio = (
            sum(1 for c in text if c in string.punctuation) / total_chars
            if total_chars
            else 0.0
        )

        # 5 — unique bigram ratio
        bg = _bigrams(words)
        ubr = len(set(bg)) / len(bg) if bg else 0.0

        # 6 — gunning fog index
        try:
            fog = float(textstat.gunning_fog(text))
        except Exception:
            fog = 0.0

        # 7 — stopword ratio
        sw_ratio = (
            sum(1 for w in words if w.lower() in stop_words) / total_words
            if total_words
            else 0.0
        )

        rows.append([perplexity, burstiness, ttr, avg_sent_len,
                     punct_ratio, ubr, fog, sw_ratio])

    return np.array(rows, dtype=float)
