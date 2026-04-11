"""
test_ensemble.py — Tests for ensemble aggregation and LR training.
"""
from __future__ import annotations

import numpy as np
import pytest
from pathlib import Path
from sklearn.linear_model import LogisticRegression
import joblib


def test_aggregate_weighted_average():
    """ai_probability must equal 0.70*roberta + 0.30*lr."""
    import ensemble
    result = ensemble.aggregate(roberta_score=0.8, lr_score=0.6)
    expected = round(0.70 * 0.8 + 0.30 * 0.6, 4)
    assert abs(result["ai_probability"] - expected) < 1e-6


def test_aggregate_label_ai():
    """label is 'ai' when ai_probability >= 0.5."""
    import ensemble
    result = ensemble.aggregate(roberta_score=1.0, lr_score=1.0)
    assert result["label"] == "ai"


def test_aggregate_label_human():
    """label is 'human' when ai_probability < 0.5."""
    import ensemble
    result = ensemble.aggregate(roberta_score=0.0, lr_score=0.0)
    assert result["label"] == "human"


def test_aggregate_keys():
    """Return dict must contain all five expected keys."""
    import ensemble
    result = ensemble.aggregate(roberta_score=0.5, lr_score=0.5)
    assert set(result.keys()) == {
        "ai_probability", "label", "roberta_score", "lr_score", "confidence"
    }


def test_aggregate_confidence_range():
    """Confidence must be in [0, 1]."""
    import ensemble
    for r, l in [(0.0, 0.0), (1.0, 1.0), (0.5, 0.5), (0.9, 0.1)]:
        result = ensemble.aggregate(r, l)
        assert 0.0 <= result["confidence"] <= 1.0, (
            f"confidence={result['confidence']} out of range for r={r}, l={l}"
        )


def test_train_lr_creates_model_file(tmp_path, monkeypatch):
    """train_lr() must save a real sklearn LogisticRegression to lr_model.pkl."""
    import ensemble
    monkeypatch.setattr(ensemble, "LR_MODEL_PATH", tmp_path / "lr_model.pkl")
    monkeypatch.setattr(ensemble, "MODELS_DIR", tmp_path)

    rng = np.random.default_rng(42)
    X = rng.random((40, 8))
    y = [0] * 20 + [1] * 20

    ensemble.train_lr(X, y)

    assert (tmp_path / "lr_model.pkl").exists()
    model = joblib.load(tmp_path / "lr_model.pkl")
    assert isinstance(model, LogisticRegression)


def test_train_lr_model_predicts(tmp_path, monkeypatch):
    """Saved model must produce probabilities of shape (n, 2)."""
    import ensemble
    monkeypatch.setattr(ensemble, "LR_MODEL_PATH", tmp_path / "lr_model.pkl")
    monkeypatch.setattr(ensemble, "MODELS_DIR", tmp_path)

    rng = np.random.default_rng(0)
    X = rng.random((40, 8))
    y = [0] * 20 + [1] * 20
    ensemble.train_lr(X, y)

    model = joblib.load(tmp_path / "lr_model.pkl")
    proba = model.predict_proba(rng.random((5, 8)))
    assert proba.shape == (5, 2)
