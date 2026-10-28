import numpy as np
import pytest
import torch

from core import detector
from core.neural_head import NeuralHead, NeuralScorer


def _scorer(emb_dim=8, n_features=5) -> NeuralScorer:
    torch.manual_seed(0)
    model = NeuralHead(emb_dim + n_features, hidden=(6, 4))
    return NeuralScorer(model, emb_dim, np.arange(n_features, dtype=float), np.full(n_features, 2.0), (6, 4))


def test_predict_proba_shape_and_range():
    probs = _scorer().predict_proba(np.random.rand(3, 8), np.random.rand(3, 5))
    assert probs.shape == (3,)
    assert np.all((probs > 0) & (probs < 1))


def test_inputs_standardize_features():
    x = _scorer().inputs(np.zeros((1, 8)), np.array([[0.0, 1.0, 2.0, 3.0, 4.0]]))
    assert np.allclose(x[0, 8:], 0.0)


def test_save_load_roundtrip(tmp_path):
    scorer = _scorer()
    emb, feats = np.random.rand(2, 8), np.random.rand(2, 5)
    scorer.save(tmp_path / "head.pt", tmp_path / "meta.json")
    loaded = NeuralScorer.load(tmp_path / "head.pt", tmp_path / "meta.json")
    assert np.allclose(loaded.predict_proba(emb, feats), scorer.predict_proba(emb, feats))


def test_neural_score_neutral_without_head(monkeypatch):
    monkeypatch.setattr(detector, "_neural_scorer", None)
    assert detector.neural_score("Any text at all.", np.zeros(25)) == 0.5


def test_neural_score_truncates_features(monkeypatch):
    dim = detector._semantic_model.get_sentence_embedding_dimension()
    scorer = _scorer(emb_dim=dim, n_features=20)
    monkeypatch.setattr(detector, "_neural_scorer", scorer)
    text = "The results were reviewed by the committee. They approved the plan unanimously."
    expected = scorer.predict_proba(detector.encode_document(text), np.ones(20))[0]
    assert detector.neural_score(text, np.ones(25)) == pytest.approx(expected)
