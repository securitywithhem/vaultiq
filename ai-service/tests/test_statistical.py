"""
test_statistical.py — Tests for statistical feature extraction.

GPT-2 is mocked so these tests run fast without loading real model weights.
"""
from __future__ import annotations

import numpy as np
import pytest
import torch
from unittest.mock import MagicMock, patch


@pytest.fixture(autouse=True)
def mock_gpt2():
    """Patch GPT-2 globals before each test to avoid loading real weights."""
    mock_tokenizer = MagicMock()
    mock_tokenizer.return_value = {
        "input_ids": torch.ones(1, 10, dtype=torch.long)
    }
    mock_output = MagicMock()
    mock_output.loss = torch.tensor(2.0)
    mock_model = MagicMock(return_value=mock_output)

    import statistical
    with patch.object(statistical, "_gpt2_tokenizer", mock_tokenizer), \
         patch.object(statistical, "_gpt2_model", mock_model):
        yield


def test_extract_features_shape_multi():
    """extract_features returns (n_chunks, 8) for multiple chunks."""
    import statistical
    chunks = [
        "The quick brown fox jumped over the lazy dog. It was a sunny afternoon.",
        "Furthermore, it is important to note that the implications are multifaceted.",
    ]
    result = statistical.extract_features(chunks)
    assert isinstance(result, np.ndarray)
    assert result.shape == (2, 8)


def test_extract_features_shape_single():
    """extract_features returns (1, 8) for a single chunk."""
    import statistical
    result = statistical.extract_features(["Hello world. This is a test sentence."])
    assert result.shape == (1, 8)


def test_extract_features_all_finite():
    """All feature values must be finite floats."""
    import statistical
    chunks = [
        "Simple text with punctuation! Does it work? Yes, it does.",
        "Another paragraph about machine learning models and their outputs.",
    ]
    result = statistical.extract_features(chunks)
    assert np.all(np.isfinite(result)), f"Non-finite values found: {result}"


def test_extract_features_empty_text():
    """Empty-ish text produces a row of zeros without raising."""
    import statistical
    result = statistical.extract_features(["   "])
    assert result.shape == (1, 8)
    assert np.all(result == 0.0)


def test_feature_indices_stable():
    """Spot-check that feature indices 5-7 (new features) are non-negative."""
    import statistical
    text = (
        "The government announced new policies regarding environmental protection. "
        "Scientists say that climate change requires immediate action. "
        "People around the world are increasingly aware of these issues."
    )
    result = statistical.extract_features([text])
    # unique_bigram_ratio (idx 5), gunning_fog (idx 6), stopword_ratio (idx 7)
    assert result[0, 5] >= 0.0
    assert result[0, 6] >= 0.0
    assert result[0, 7] >= 0.0
