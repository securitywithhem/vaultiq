"""
preprocessor.py — Text preprocessing and sentence-chunk splitting.

Uses spaCy (en_core_web_sm) for sentence boundary detection, then groups
sentences into overlapping chunks of 3-5 sentences for downstream analysis.
"""

from __future__ import annotations

import re
from typing import Any

# spaCy model is loaded lazily so the module can be imported without it
# being present at import time (useful in tests / CI).
_nlp: Any = None


def _get_nlp() -> Any:
    """Load and cache the spaCy pipeline.

    Returns:
        A spaCy Language object.

    Raises:
        ImportError: If spaCy is not installed.
        OSError: If the en_core_web_sm model is not downloaded.
    """
    global _nlp
    if _nlp is None:
        try:
            import spacy
        except ImportError as exc:
            raise ImportError(
                "spaCy is required for preprocessing. "
                "Install it with: pip install spacy && "
                "python -m spacy download en_core_web_sm"
            ) from exc
        try:
            _nlp = spacy.load("en_core_web_sm", disable=["ner", "tagger", "parser"])
            _nlp.enable_pipe("senter")  # fast sentence segmentation
        except OSError:
            # Fallback: load with the full pipeline if senter is unavailable
            _nlp = spacy.load("en_core_web_sm")
    return _nlp


def preprocess(text: str, chunk_size: int = 4) -> list[str]:
    """Clean *text* and split it into sentence-level chunks.

    Steps:
      1. Remove excessive whitespace and special characters.
      2. Use spaCy to detect sentence boundaries.
      3. Group consecutive sentences into chunks of *chunk_size* (3-5).

    Args:
        text: Raw input string (e.g. output of ``extractor.extract_text``).
        chunk_size: Target number of sentences per chunk (clamped to 3-5).

    Returns:
        A list of non-empty string chunks, each containing *chunk_size*
        sentences (the last chunk may contain fewer).

    Raises:
        ValueError: If *text* is empty after cleaning.
    """
    if not text or not text.strip():
        raise ValueError("Cannot preprocess empty text.")

    chunk_size = max(3, min(5, chunk_size))

    cleaned = _clean(text)
    sentences = _sentencise(cleaned)

    if not sentences:
        raise ValueError("No sentences could be extracted from the provided text.")

    return _chunk(sentences, chunk_size)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _clean(text: str) -> str:
    """Remove noise from raw text while preserving sentence structure.

    - Replaces non-printable / control characters with a space.
    - Collapses multiple whitespace characters (except newlines) to one space.
    - Strips leading/trailing whitespace per line.
    - Removes lines that consist entirely of special characters or numbers
      (e.g. page headers/footers in PDFs).

    Args:
        text: Raw string.

    Returns:
        Lightly cleaned string suitable for sentence splitting.
    """
    # Remove control characters (except newline / tab)
    text = re.sub(r"[^\x09\x0A\x20-\x7E\u00A0-\uFFFF]", " ", text)

    # Normalise horizontal whitespace within each line
    lines: list[str] = []
    for line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", line).strip()
        # Drop lines that are purely numeric or punctuation (page numbers, etc.)
        if re.fullmatch(r"[\d\s\W]+", line):
            continue
        if line:
            lines.append(line)

    return " ".join(lines)


def _sentencise(text: str) -> list[str]:
    """Split *text* into individual sentences using spaCy.

    Args:
        text: Cleaned text string.

    Returns:
        List of sentence strings with leading/trailing whitespace stripped.
    """
    nlp = _get_nlp()
    # spaCy has a default max_length; increase it for large documents
    nlp.max_length = max(nlp.max_length, len(text) + 1)

    doc = nlp(text)
    return [sent.text.strip() for sent in doc.sents if sent.text.strip()]


def _chunk(sentences: list[str], chunk_size: int) -> list[str]:
    """Group *sentences* into sequential chunks of *chunk_size* sentences.

    Args:
        sentences: Ordered list of sentence strings.
        chunk_size: Number of sentences per chunk.

    Returns:
        List of joined chunk strings.
    """
    chunks: list[str] = []
    for i in range(0, len(sentences), chunk_size):
        group = sentences[i : i + chunk_size]
        chunk_text = " ".join(group).strip()
        if chunk_text:
            chunks.append(chunk_text)
    return chunks
