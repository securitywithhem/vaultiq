"""
Integration tests for AI detection service.
Verifies core pipeline, API endpoints, and proper error handling.
"""

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.detector import extract_features, load_models
from core.extractor import extract_text
from core.preprocessor import preprocess
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True, scope="session")
def load_all_models():
    """Load models once per test session."""
    load_models()
    yield


class TestHealthEndpoint:
    """Verify service health check."""

    def test_health_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_has_required_fields(self):
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert "model_loaded" in data
        assert "version" in data
        assert data["status"] == "ok"


class TestDetectTextEndpoint:
    """Test raw text detection endpoint."""

    def test_detect_text_human_content(self):
        response = client.post(
            "/detect/text",
            json={"text": "This is a human written paragraph about the weather and daily life."}
        )
        assert response.status_code == 200
        data = response.json()
        assert "score" in data
        assert "verdict" in data
        assert "confidence" in data
        assert 0 <= data["score"] <= 1

    def test_detect_text_empty_raises_400(self):
        response = client.post("/detect/text", json={"text": ""})
        assert response.status_code == 400

    def test_detect_text_missing_text_raises_400(self):
        response = client.post("/detect/text", json={})
        assert response.status_code == 400


class TestDetectFilesEndpoint:
    """Test file upload detection endpoint."""

    def test_detect_text_file(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp:
            tmp.write("This is a test document about machine learning and AI detection.")
            tmp_path = tmp.name

        try:
            with open(tmp_path, 'rb') as f:
                response = client.post("/detect", files={"files": f})
            assert response.status_code == 200
            data = response.json()
            assert "results" in data
            assert len(data["results"]) > 0
            result = data["results"][0]
            assert result["status"] == "ok"
            assert "score" in result
            assert "verdict" in result
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_detect_no_files_raises_422(self):
        response = client.post("/detect", files={})
        assert response.status_code == 422

    def test_detect_too_many_files_raises_422(self):
        files = [("files", ("test.txt", b"content")) for _ in range(6)]
        response = client.post("/detect", files=files)
        assert response.status_code == 422


class TestCorePipeline:
    """Test core detection pipeline components."""

    def test_extract_features(self):
        text = "This is a sample sentence for feature extraction."
        features = extract_features(text)
        assert features is not None
        assert len(features) == 8
        assert all(isinstance(f, (float, int)) for f in features)

    def test_preprocess_text(self):
        text = "First sentence. Second sentence. Third sentence."
        chunks = preprocess(text)
        assert isinstance(chunks, list)
        assert len(chunks) > 0
        assert all(isinstance(c, str) for c in chunks)

    def test_extract_text_from_file(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp:
            tmp.write("Test content for extraction.")
            tmp_path = tmp.name

        try:
            text = extract_text(tmp_path, 'txt')
            assert text is not None
            assert "Test content" in text
        finally:
            Path(tmp_path).unlink(missing_ok=True)


class TestErrorHandling:
    """Verify proper error handling."""

    def test_detect_unsupported_file_type(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xyz', delete=False) as tmp:
            tmp.write("content")
            tmp_path = tmp.name

        try:
            with open(tmp_path, 'rb') as f:
                response = client.post("/detect", files={"files": f})
            assert response.status_code == 200
            data = response.json()
            result = data["results"][0]
            assert result["status"] == "error"
            assert "Unsupported" in result.get("error", "")
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_detect_text_with_whitespace_only(self):
        response = client.post("/detect/text", json={"text": "   \n\t  "})
        assert response.status_code == 400
