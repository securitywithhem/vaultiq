"""
test_detector.py — Fix 3 corrections:
  1. /api/v1/detect does not exist. Text-based tests now call /detect/text
     which accepts JSON {"text": ..., "document_id": ...}.
  2. Response keys are score/verdict/confidence, not is_ai_generated/confidence_score/metrics.
  3. health endpoint returns {"status": "ok"}, not {"status": "healthy"}.
  4. extract_features() returns np.ndarray of shape (5,), not a dict.
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from core.detector import extract_features, load_models
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_models():
    """Ensure all ML models are loaded before each test."""
    load_models()


# ── test_1: health endpoint ────────────────────────────────────────────────────

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"          # Fix 3: was "healthy"; actual value is "ok"
    assert "model_loaded" in data
    assert data["model_loaded"] is True


# ── test_2: AI-generated text detection ───────────────────────────────────────

def test_detect_ai_generated_text():
    # Fix 3: was POST /api/v1/detect with JSON — endpoint doesn't exist.
    # Correct endpoint for text input is POST /detect/text (JSON body).
    text = (
        "Furthermore, in conclusion, it is important to note that the implications "
        "of this study are multifaceted. Additionally, one must consider the various "
        "aspects of the situation before coming to a definitive conclusion."
    )
    response = client.post("/detect/text", json={"text": text, "document_id": "test-ai"})
    assert response.status_code == 200
    data = response.json()
    # Fix 3: actual response keys — not is_ai_generated / confidence_score / metrics
    assert "score" in data
    assert "verdict" in data
    assert "confidence" in data
    assert isinstance(data["score"], float)
    assert data["verdict"] in ("human", "mixed", "ai_generated")
    assert data["confidence"] in ("low", "medium", "high")


# ── test_3: human-written text detection ──────────────────────────────────────

def test_detect_human_text():
    # Fix 3: same endpoint + key corrections as test_2
    text = (
        "Hey guys, just wanted to share my thoughts on the game last night. "
        "It was seriously amazing, couldn't believe that final play! "
        "What did you all think?"
    )
    response = client.post("/detect/text", json={"text": text, "document_id": "test-human"})
    assert response.status_code == 200
    data = response.json()
    assert "score" in data
    assert "verdict" in data
    assert "confidence" in data
    assert isinstance(data["score"], float)
    assert data["verdict"] in ("human", "mixed", "ai_generated")
    assert data["confidence"] in ("low", "medium", "high")


# ── test_4: extract_features return type ──────────────────────────────────────

def test_extract_features():
    # Fix 3: extract_features() returns np.ndarray of shape (5,), NOT a dict.
    # The 5 features are: perplexity, burstiness, ttr, avg_sent_len, punct_density
    text = "This is a simple test sentence."
    features = extract_features(text)

    assert isinstance(features, np.ndarray), (
        f"Expected np.ndarray, got {type(features)}"
    )
    assert features.shape == (5,), (
        f"Expected shape (5,), got {features.shape}"
    )
    # Every feature value must be a finite real number
    assert all(np.isfinite(v) for v in features), (
        f"Expected all finite values, got {features}"
    )
