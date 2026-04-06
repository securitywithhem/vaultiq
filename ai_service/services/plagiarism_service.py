"""
services/plagiarism_service.py — Orchestration layer for plagiarism detection.

Wraps the PlagiarismModel to produce a fully structured PlagiarismResult.
Handles the cold-start case (empty corpus) gracefully.
"""

from __future__ import annotations

from typing import List

from models.plagiarism_model import PlagiarismModel
from schemas.request_response import MatchedSegment, PlagiarismResult
from utils.helpers import clamp, plagiarism_verdict


def run_plagiarism_detection(
    model: PlagiarismModel,
    raw_text: str,
) -> PlagiarismResult:
    """
    Run plagiarism detection on *raw_text* using the provided model.

    Cold-start behaviour: if the FAISS corpus is empty the function
    returns score=0.0, verdict="CLEAN", and an empty matched_segments list
    instead of raising an error.

    Args:
        model:    Loaded PlagiarismModel instance (from app.state).
        raw_text: Original text (punctuation preserved).

    Returns:
        PlagiarismResult Pydantic model ready for serialisation.

    Raises:
        RuntimeError: On unexpected model or preprocessing errors.
    """
    try:
        # ── Cold-start: empty corpus ──────────────────────────────────────────
        if model.is_empty:
            return PlagiarismResult(
                score=0.0,
                percentage=0.0,
                verdict="CLEAN",
                matched_segments=[],
            )

        # ── Retrieve hits from FAISS ──────────────────────────────────────────
        hits = model.search(raw_text, top_k=5)
        total_windows = model.window_count(raw_text)

        # ── Compute plagiarism score ──────────────────────────────────────────
        if total_windows == 0:
            plag_score = 0.0
        else:
            flagged = len(hits)
            plag_score = clamp(flagged / total_windows)

        # ── Build matched segments ────────────────────────────────────────────
        matched_segments: List[MatchedSegment] = []
        for hit in hits:
            matched_segments.append(
                MatchedSegment(
                    text=hit["text"],
                    similarity=round(clamp(hit["similarity"]), 4),
                    matched_doc_id=hit["matched_doc_id"],
                    start_char=hit["start_char"],
                    end_char=hit["end_char"],
                )
            )

        verdict = plagiarism_verdict(plag_score)

        return PlagiarismResult(
            score=round(plag_score, 4),
            percentage=round(plag_score * 100.0, 2),
            verdict=verdict,
            matched_segments=matched_segments,
        )

    except Exception as exc:
        raise RuntimeError(f"Plagiarism detection failed: {exc}") from exc
