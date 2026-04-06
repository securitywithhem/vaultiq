"""
services/ai_detection_service.py — Orchestration layer for AI text detection.

Combines feature extraction + hybrid model inference into a structured result.
"""

from __future__ import annotations

from models.ai_detector_model import AIDetectorModel
from schemas.request_response import AIDetectionResult, AIFeatures
from services.feature_extractor import TextFeatures, extract_features
from utils.helpers import ai_verdict, clamp


def run_ai_detection(
    model: AIDetectorModel,
    raw_text: str,
    sentences: list[str],
    all_tokens: list[str],
) -> AIDetectionResult:
    """
    Run AI text detection on pre-processed text components.

    Args:
        model:      Loaded AIDetectorModel instance (from app.state).
        raw_text:   Original text with punctuation preserved.
        sentences:  Sentence-tokenized list (from preprocessor).
        all_tokens: Word tokens (from preprocessor).

    Returns:
        AIDetectionResult Pydantic model ready for serialisation.

    Raises:
        RuntimeError: On unexpected model or feature extraction errors.
    """
    try:
        # ── Feature extraction ────────────────────────────────────────────────
        features: TextFeatures = extract_features(raw_text, sentences, all_tokens)

        # ── Hybrid model inference ────────────────────────────────────────────
        final_prob, rf_conf, db_conf = model.predict(features, raw_text)

        # ── Build response ────────────────────────────────────────────────────
        ai_features = AIFeatures(
            perplexity=round(features.perplexity, 4),
            burstiness=round(features.burstiness, 4),
            entropy=round(features.entropy, 4),
            repetition_rate=round(features.repetition_rate, 4),
        )

        verdict = ai_verdict(final_prob)

        return AIDetectionResult(
            probability=round(clamp(final_prob), 4),
            percentage=round(clamp(final_prob) * 100.0, 2),
            verdict=verdict,
            features=ai_features,
            distilbert_confidence=round(clamp(db_conf), 4),
            rf_confidence=round(clamp(rf_conf), 4),
        )

    except Exception as exc:
        raise RuntimeError(f"AI detection failed: {exc}") from exc
