"""
models/ai_detector_model.py — DistilBERT + Random Forest hybrid AI detector.

Architecture:
  - RandomForestClassifier on 7 statistical/neural features (always active)
  - DistilBERT fine-tuned binary classifier (optional; falls back gracefully)
  - Ensemble: final_prob = 0.40 * rf_prob + 0.60 * distilbert_prob
              (if DistilBERT not loaded: final_prob = rf_prob)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Tuple

import joblib
import numpy as np
import torch
from sklearn.ensemble import RandomForestClassifier
from transformers import (
    DistilBertForSequenceClassification,
    DistilBertTokenizerFast,
)

from config import (
    AI_DISTILBERT_WEIGHT,
    AI_RF_WEIGHT,
    DISTILBERT_BASE_MODEL_ID,
    DISTILBERT_MAX_LENGTH,
    DISTILBERT_MODEL_DIR,
    DISTILBERT_NUM_LABELS,
    RF_MODEL_PATH,
)
from services.feature_extractor import TextFeatures


class AIDetectorModel:
    """
    Hybrid AI text detector combining statistical features (RF) with
    a DistilBERT sequence classifier.
    """

    def __init__(self) -> None:
        self._rf: Optional[RandomForestClassifier] = None
        self._distilbert: Optional[DistilBertForSequenceClassification] = None
        self._tokenizer: Optional[DistilBertTokenizerFast] = None
        self._device: str = "cpu"
        self._distilbert_loaded: bool = False

    # ─── Startup ──────────────────────────────────────────────────────────────

    def load(self) -> None:
        """
        Load Random Forest and DistilBERT models from disk.

        - RF is attempted from RF_MODEL_PATH; if absent a heuristic
          threshold-based fallback is used instead.
        - DistilBERT is attempted from DISTILBERT_MODEL_DIR; if absent
          the service runs in RF-only mode without crashing.
        """
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._load_random_forest()
        self._load_distilbert()

    def _load_random_forest(self) -> None:
        rf_path = Path(RF_MODEL_PATH)
        if rf_path.exists():
            self._rf = joblib.load(str(rf_path))
        else:
            # Fallback: untrained RF — predict will use heuristic rules
            self._rf = None

    def _load_distilbert(self) -> None:
        db_path = Path(DISTILBERT_MODEL_DIR)
        if db_path.exists() and any(db_path.iterdir()):
            try:
                self._tokenizer = DistilBertTokenizerFast.from_pretrained(
                    str(db_path)
                )
                self._distilbert = DistilBertForSequenceClassification.from_pretrained(
                    str(db_path),
                    num_labels=DISTILBERT_NUM_LABELS,
                )
                self._distilbert.to(self._device)  # type: ignore[union-attr]
                self._distilbert.eval()
                self._distilbert_loaded = True
            except Exception:
                # Non-fatal: fall back to RF-only
                self._distilbert = None
                self._distilbert_loaded = False
        else:
            self._distilbert = None
            self._distilbert_loaded = False

    # ─── Inference ────────────────────────────────────────────────────────────

    def predict_rf(self, features: TextFeatures) -> float:
        """
        Predict AI probability using the Random Forest (or heuristic fallback).

        Returns a probability in [0.0, 1.0].
        """
        try:
            vector = np.array(features.to_vector()).reshape(1, -1)

            if self._rf is not None:
                proba = self._rf.predict_proba(vector)[0]
                # Index 1 = AI-generated class probability
                ai_prob = float(proba[1]) if len(proba) > 1 else float(proba[0])
                return float(np.clip(ai_prob, 0.0, 1.0))

            # ── Heuristic fallback (no trained RF available) ───────────────
            score = 0.0
            # Low perplexity → AI signal
            if features.perplexity < 30:
                score += 0.4
            elif features.perplexity < 50:
                score += 0.2

            # Low burstiness → AI signal
            if features.burstiness < 1.0:
                score += 0.2

            # High repetition rate → AI signal
            if features.repetition_rate > 0.05:
                score += 0.2

            # Low vocab richness → AI signal
            if features.vocab_richness < 0.5:
                score += 0.1

            # Low entropy → AI signal
            if features.entropy < 3.0:
                score += 0.1

            return float(np.clip(score, 0.0, 1.0))

        except Exception:
            return 0.5  # neutral fallback on error

    def predict_distilbert(self, raw_text: str) -> float:
        """
        Predict AI probability using DistilBERT.

        Returns a probability in [0.0, 1.0], or 0.5 if model not loaded.
        """
        if not self._distilbert_loaded or self._distilbert is None:
            return 0.5  # neutral — will not influence ensemble if not loaded

        try:
            inputs = self._tokenizer(  # type: ignore[operator]
                raw_text,
                return_tensors="pt",
                truncation=True,
                max_length=DISTILBERT_MAX_LENGTH,
                padding=True,
            )
            inputs = {k: v.to(self._device) for k, v in inputs.items()}

            with torch.no_grad():
                logits = self._distilbert(**inputs).logits  # type: ignore[operator]

            probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]
            # Label mapping: index 1 = ai_generated
            ai_prob = float(probs[1]) if len(probs) > 1 else float(probs[0])
            return float(np.clip(ai_prob, 0.0, 1.0))

        except Exception:
            return 0.5

    def predict(
        self, features: TextFeatures, raw_text: str
    ) -> Tuple[float, float, float]:
        """
        Run the full hybrid inference pipeline.

        Returns:
            (final_probability, rf_confidence, distilbert_confidence)
        """
        rf_prob = self.predict_rf(features)
        db_prob = self.predict_distilbert(raw_text)

        if self._distilbert_loaded:
            final = AI_RF_WEIGHT * rf_prob + AI_DISTILBERT_WEIGHT * db_prob
        else:
            final = rf_prob
            db_prob = rf_prob  # report RF value for both when DB absent

        return (
            float(np.clip(final, 0.0, 1.0)),
            float(np.clip(rf_prob, 0.0, 1.0)),
            float(np.clip(db_prob, 0.0, 1.0)),
        )

    @property
    def distilbert_loaded(self) -> bool:
        return self._distilbert_loaded
