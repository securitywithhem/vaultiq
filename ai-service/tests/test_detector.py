import pytest
from fastapi.testclient import TestClient
from main import app
from detector import extract_features, load_models

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_models():
    # Ensure models are loaded before tests run
    load_models()

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_detect_ai_generated_text():
    # Provide a typical AI-generated pattern (very formal, repetitive structures)
    text = "Furthermore, in conclusion, it is important to note that the implications of this study are multifaceted. Additionally, one must consider the various aspects of the situation before coming to a definitive conclusion."
    response = client.post("/api/v1/detect", json={"text": text, "filename": "test.txt"})
    assert response.status_code == 200
    data = response.json()
    assert "is_ai_generated" in data
    assert "confidence_score" in data
    assert "metrics" in data

def test_detect_human_text():
    # Provide informal human text
    text = "Hey guys, just wanted to share my thoughts on the game last night. It was seriously amazing, couldn't believe that final play! What did you all think?"
    response = client.post("/api/v1/detect", json={"text": text, "filename": "test.txt"})
    assert response.status_code == 200
    data = response.json()
    assert "is_ai_generated" in data
    assert "confidence_score" in data
    assert "metrics" in data

def test_extract_features():
    text = "This is a simple test sentence."
    features = extract_features(text)
    assert len(features) > 0
    # Check that required features are present
    feature_keys = [
        'avg_word_length', 'vocab_richness', 'sentence_length_var',
        'readability_score', 'stop_word_ratio', 'punctuation_density',
        'perplexity', 'burstiness'
    ]
    for key in feature_keys:
        assert key in features
        assert isinstance(features[key], (int, float))
