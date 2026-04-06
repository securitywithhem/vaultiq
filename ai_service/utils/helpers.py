"""
utils/helpers.py — Shared utility functions used across the microservice.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

from config import (
    AI_HUMAN_MAX,
    AI_LIKELY_HUMAN_MAX,
    AI_UNCERTAIN_MAX,
    AI_LIKELY_AI_MAX,
    OVERALL_CLEAN_MAX,
    OVERALL_SUSPICIOUS_MAX,
    PLAGIARISM_CLEAN_MAX,
    PLAGIARISM_LOW_RISK_MAX,
    PLAGIARISM_MEDIUM_MAX,
)


def sha256_hash(text: str) -> str:
    """Return SHA-256 hex digest of a string."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def current_time_ms() -> int:
    """Return current epoch time in milliseconds."""
    return int(time.time() * 1000)


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """Clamp a float value to [lo, hi]."""
    return max(lo, min(hi, value))


def plagiarism_verdict(score: float) -> str:
    """Map a plagiarism score (0–1) to a verdict string."""
    score = clamp(score)
    if score < PLAGIARISM_CLEAN_MAX:
        return "CLEAN"
    if score < PLAGIARISM_LOW_RISK_MAX:
        return "LOW_RISK"
    if score < PLAGIARISM_MEDIUM_MAX:
        return "MEDIUM"
    return "HIGH_RISK"


def ai_verdict(probability: float) -> str:
    """Map an AI probability (0–1) to a verdict string."""
    probability = clamp(probability)
    if probability < AI_HUMAN_MAX:
        return "HUMAN"
    if probability < AI_LIKELY_HUMAN_MAX:
        return "LIKELY_HUMAN"
    if probability < AI_UNCERTAIN_MAX:
        return "UNCERTAIN"
    if probability < AI_LIKELY_AI_MAX:
        return "LIKELY_AI"
    return "AI"


def overall_verdict(risk_score: float) -> str:
    """Map a combined risk score (0–1) to an overall verdict string."""
    risk_score = clamp(risk_score)
    if risk_score < OVERALL_CLEAN_MAX:
        return "CLEAN"
    if risk_score < OVERALL_SUSPICIOUS_MAX:
        return "SUSPICIOUS"
    return "HIGH_RISK"


def load_json(path: str) -> Any:
    """Load JSON from a file path. Returns empty dict if file does not exist."""
    p = Path(path)
    if not p.exists():
        return {}
    try:
        with p.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return {}


def save_json(data: Any, path: str) -> None:
    """Persist data as JSON to a file path, creating parent dirs as needed."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def cosine_similarity_np(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two 1-D numpy arrays."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def sentence_windows(sentences: List[str], window: int, stride: int) -> List[List[str]]:
    """
    Split a list of sentences into overlapping windows.

    Args:
        sentences: Ordered list of sentence strings.
        window:    Number of sentences per window.
        stride:    Step size between consecutive windows.

    Returns:
        List of sentence groups (each group is a list of strings).
    """
    if not sentences:
        return []
    windows: List[List[str]] = []
    i = 0
    while i < len(sentences):
        chunk = sentences[i : i + window]
        windows.append(chunk)
        if i + window >= len(sentences):
            break
        i += stride
    return windows


def find_substring_offsets(text: str, substring: str) -> tuple[int, int]:
    """
    Return (start_char, end_char) of the first occurrence of substring in text.
    Returns (-1, -1) if not found.
    """
    idx = text.find(substring)
    if idx == -1:
        return -1, -1
    return idx, idx + len(substring)
