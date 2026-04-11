"""
ensemble.py — Ensemble aggregation and Logistic Regression training.

Functions
---------
aggregate(roberta_score, lr_score) -> dict
    Weighted combination (0.70 RoBERTa + 0.30 LR) → verdict dict.

train_lr(features, labels) -> None
    Train a LogisticRegression on 8-feature vectors, save to models/lr_model.pkl.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

MODELS_DIR = Path(__file__).parent / "models"
LR_MODEL_PATH = MODELS_DIR / "lr_model.pkl"


def aggregate(roberta_score: float, lr_score: float) -> Dict[str, Any]:
    """Combine RoBERTa and LR scores into a detection verdict.

    Weights: 0.70 × roberta_score + 0.30 × lr_score

    Args:
        roberta_score: AI probability [0, 1] from roberta-base-openai-detector.
        lr_score:      AI probability [0, 1] from the Logistic Regression model.

    Returns:
        Dictionary with keys:
          ai_probability (float) — weighted score in [0, 1]
          label          (str)   — "ai" if ai_probability >= 0.5 else "human"
          roberta_score  (float) — input value, rounded
          lr_score       (float) — input value, rounded
          confidence     (float) — distance from decision boundary, scaled to [0, 1]
    """
    ai_prob = round(0.70 * roberta_score + 0.30 * lr_score, 4)
    label = "ai" if ai_prob >= 0.5 else "human"
    # Map score → confidence: 0.0 and 1.0 are maximally certain, 0.5 is zero confidence
    confidence = round(abs(ai_prob - 0.5) * 2.0, 4)
    return {
        "ai_probability": ai_prob,
        "label": label,
        "roberta_score": round(float(roberta_score), 4),
        "lr_score": round(float(lr_score), 4),
        "confidence": confidence,
    }


def train_lr(features: np.ndarray, labels: List[int]) -> None:
    """Train a LogisticRegression on 8-feature vectors and persist it to disk.

    Args:
        features: Array of shape (n_samples, 8) from statistical.extract_features.
        labels:   Binary list — 0 for human-written, 1 for AI-generated.
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    lr = LogisticRegression(max_iter=1000, random_state=42)
    lr.fit(features, labels)
    joblib.dump(lr, LR_MODEL_PATH)
