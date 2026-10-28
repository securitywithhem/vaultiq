import numpy as np
import pytest

from core import detector
from core.embeddings import N_EMBEDDING_FEATURES, attention_pool, doc_embedding_features

SAMPLE_TEXT = (
    "The committee reviewed the proposal in detail over several weeks. "
    "Several members raised concerns about the projected budget overruns. "
    "After a long debate, the final vote was postponed until next spring. "
    "Meanwhile, the city council announced a separate inquiry into the matter."
)


def test_too_few_sentences_returns_zeros():
    assert np.array_equal(doc_embedding_features(np.ones((1, 8))), np.zeros(N_EMBEDDING_FEATURES))


def test_identical_sentences_have_no_spread():
    feats = doc_embedding_features(np.tile(np.arange(1, 9, dtype=float), (4, 1)))
    mean_max_div, redundancy, spread, _, attn_entropy = feats
    assert mean_max_div == pytest.approx(0.0, abs=1e-9)
    assert redundancy == pytest.approx(1.0)
    assert spread == pytest.approx(0.0, abs=1e-9)
    assert attn_entropy == pytest.approx(1.0)


def test_diverse_sentences_spread_more_than_similar_ones():
    rng = np.random.default_rng(0)
    base = rng.normal(size=32)
    similar = base + 0.01 * rng.normal(size=(6, 32))
    diverse = rng.normal(size=(6, 32))
    assert doc_embedding_features(diverse)[2] > doc_embedding_features(similar)[2]


def test_redundancy_ignores_adjacent_pairs():
    a, b, c = np.eye(3)
    assert doc_embedding_features(np.stack([a, a, b]))[1] == pytest.approx(0.0, abs=1e-9)
    assert doc_embedding_features(np.stack([a, b, a]))[1] == pytest.approx(1.0)
    assert doc_embedding_features(np.stack([a, b]))[1] == 0.0


def test_pc1_ratio_is_one_when_variation_is_one_dimensional():
    direction = np.zeros(16)
    direction[0] = 1.0
    emb = np.ones(16) + np.outer([0.0, 1.0, 2.0, 3.0], direction)
    assert doc_embedding_features(emb)[3] == pytest.approx(1.0)


def test_attention_weights_sum_to_one():
    _, weights = attention_pool(np.random.default_rng(1).normal(size=(5, 10)))
    assert weights.sum() == pytest.approx(1.0)
    assert np.all(weights > 0)


def test_build_feature_vector_shape():
    assert detector.build_feature_vector(SAMPLE_TEXT).shape == (13 + 4 + 3 + N_EMBEDDING_FEATURES,)


def test_lr_score_truncates_to_model_feature_count(monkeypatch):
    class TwentyFeatureModel:
        n_features_in_ = 20

        def predict_proba(self, X):
            assert X.shape == (1, 20)
            return np.array([[0.2, 0.8]])

    monkeypatch.setattr(detector, "_lr_model", TwentyFeatureModel())
    assert detector.lr_score_enhanced(np.zeros(25)) == pytest.approx(0.8)
