"""
services/preprocessor.py — NLP cleaning pipeline.

Produces TWO versions of the input text:
  - raw_text:   Original text with punctuation preserved
                (used for DistilBERT, GPT-2 perplexity)
  - clean_text: Lowercase, no stopwords, no punctuation
                (used for TF-IDF and SBERT corpus queries)
"""

from __future__ import annotations

import re
import string
from dataclasses import dataclass
from typing import List

import nltk

# Ensure required NLTK resources are present
nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)
nltk.download("stopwords", quiet=True)
nltk.download("averaged_perceptron_tagger", quiet=True)

from nltk.corpus import stopwords
from nltk.tokenize import sent_tokenize, word_tokenize

_STOPWORDS: set[str] = set(stopwords.words("english"))
_PUNCT_TABLE = str.maketrans("", "", string.punctuation)


@dataclass
class ProcessedText:
    """Container for both representations of the preprocessed input."""
    raw_text: str
    clean_text: str
    sentences: List[str]          # Sentence-tokenized from raw_text
    clean_tokens: List[str]       # Cleaned token list from clean_text


def _normalize_whitespace(text: str) -> str:
    """Collapse multiple whitespace characters into a single space."""
    return re.sub(r"\s+", " ", text).strip()


def _remove_urls(text: str) -> str:
    """Strip http/https URLs from text."""
    return re.sub(r"https?://\S+", " ", text)


def _remove_emails(text: str) -> str:
    """Strip email addresses from text."""
    return re.sub(r"\S+@\S+\.\S+", " ", text)


def preprocess(raw_input: str) -> ProcessedText:
    """
    Preprocess raw input text into both a clean and a raw representation.

    Steps for raw_text:
      1. Remove URLs and email addresses
      2. Normalize whitespace

    Steps for clean_text (additionally):
      3. Lowercase
      4. Remove punctuation
      5. Remove stopwords
      6. Normalize whitespace again

    Args:
        raw_input: The original text string received from the caller.

    Returns:
        ProcessedText with raw_text, clean_text, sentences, and clean_tokens.
    """
    try:
        # ── Raw representation (preserve punctuation / structure) ──────────────
        raw_text = _normalize_whitespace(_remove_emails(_remove_urls(raw_input)))

        # ── Sentence tokenization from raw text ───────────────────────────────
        sentences: List[str] = [s.strip() for s in sent_tokenize(raw_text) if s.strip()]

        # ── Clean representation ───────────────────────────────────────────────
        clean = raw_text.lower()
        clean = clean.translate(_PUNCT_TABLE)           # remove punctuation
        clean = _normalize_whitespace(clean)

        # Stopword removal at token level
        tokens: List[str] = [
            tok for tok in word_tokenize(clean)
            if tok and tok not in _STOPWORDS and tok.isalpha()
        ]
        clean_text = " ".join(tokens)

        return ProcessedText(
            raw_text=raw_text,
            clean_text=clean_text,
            sentences=sentences,
            clean_tokens=tokens,
        )
    except Exception as exc:
        raise RuntimeError(f"Preprocessing failed: {exc}") from exc
