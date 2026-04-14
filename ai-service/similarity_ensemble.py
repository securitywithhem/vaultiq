"""
similarity_ensemble.py — Plagiarism scoring aggregator for VaultIQ.

Combines cosine, Jaccard, and semantic similarity scores using a
weighted average, then maps the result to a human-readable verdict.

Weights: cosine=0.40, jaccard=0.20, semantic=0.40
Thresholds:
  < 0.30 → "original"
  0.30–0.65 → "suspicious"
  > 0.65 → "plagiarized"
"""

from __future__ import annotations

from typing import Any, Dict


# ── Verdict thresholds ────────────────────────────────────────────────────────
_THRESHOLD_SUSPICIOUS  = 0.30
_THRESHOLD_PLAGIARIZED = 0.65

# ── Score weights ─────────────────────────────────────────────────────────────
_W_COSINE   = 0.40
_W_JACCARD  = 0.20
_W_SEMANTIC = 0.40


def _verdict(score: float) -> str:
    """Map a plagiarism score to a verdict label.

    Args:
        score: Weighted aggregate plagiarism score in [0.0, 1.0].

    Returns:
        "original" | "suspicious" | "plagiarized"
    """
    if score < _THRESHOLD_SUSPICIOUS:
        return "original"
    elif score <= _THRESHOLD_PLAGIARIZED:
        return "suspicious"
    return "plagiarized"


def aggregate_scores(
    cosine:       float,
    jaccard:      float,
    semantic:     float,
    chunk:        str,
    matched_text: str,
) -> Dict[str, Any]:
    """Aggregate individual similarity scores into a plagiarism verdict dict.

    The plagiarism_score is a weighted combination:
      0.40 × cosine + 0.20 × jaccard + 0.40 × semantic

    Args:
        cosine:       TF-IDF cosine similarity score [0.0, 1.0].
        jaccard:      Jaccard word-set similarity score [0.0, 1.0].
        semantic:     Sentence-transformer cosine similarity [0.0, 1.0].
        chunk:        The source text chunk that was analysed.
        matched_text: The best-matching corpus excerpt.

    Returns:
        Dictionary with keys:
          plagiarism_score  (float) — weighted aggregate in [0.0, 1.0]
          verdict           (str)   — "original" | "suspicious" | "plagiarized"
          cosine_score      (float)
          jaccard_score     (float)
          semantic_score    (float)
          matched_excerpt   (str)   — first 300 chars of matched_text
          confidence        (float) — how far from nearest decision boundary [0,1]
    """
    # Clamp inputs to [0, 1]
    cosine   = float(max(0.0, min(1.0, cosine)))
    jaccard  = float(max(0.0, min(1.0, jaccard)))
    semantic = float(max(0.0, min(1.0, semantic)))

    score = round(
        _W_COSINE * cosine + _W_JACCARD * jaccard + _W_SEMANTIC * semantic,
        4,
    )
    v = _verdict(score)

    # Confidence = how far from the nearest boundary, scaled to [0, 1]
    if v == "original":
        confidence = round(1.0 - (score / _THRESHOLD_SUSPICIOUS), 4)
    elif v == "plagiarized":
        confidence = round((score - _THRESHOLD_PLAGIARIZED) / (1.0 - _THRESHOLD_PLAGIARIZED), 4)
    else:  # suspicious — midpoint between boundaries
        mid   = (_THRESHOLD_SUSPICIOUS + _THRESHOLD_PLAGIARIZED) / 2.0
        width = (_THRESHOLD_PLAGIARIZED - _THRESHOLD_SUSPICIOUS) / 2.0
        confidence = round(1.0 - abs(score - mid) / max(width, 1e-9), 4)

    confidence = float(max(0.0, min(1.0, confidence)))

    return {
        "plagiarism_score": score,
        "verdict":          v,
        "cosine_score":     round(cosine,   4),
        "jaccard_score":    round(jaccard,  4),
        "semantic_score":   round(semantic, 4),
        "matched_excerpt":  (matched_text or "")[:300],
        "confidence":       confidence,
    }
