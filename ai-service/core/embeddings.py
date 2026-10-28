"""
embeddings.py — Document-level features from sentence embeddings.

Pools a (n_sentences, dim) matrix of sentence embeddings into a document
representation and summarises its geometry as a fixed-size feature vector.
Pure numpy so it can be unit-tested without loading an embedding model.
"""

from __future__ import annotations

import numpy as np

N_EMBEDDING_FEATURES = 5

EMBEDDING_FEATURE_NAMES = (
    "mean_max_pool_divergence",
    "redundancy",
    "centroid_spread",
    "pc1_variance_ratio",
    "attention_entropy",
)

_EPS = 1e-10


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + _EPS))


def attention_pool(embeddings: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Weights each sentence by softmax similarity to the mean embedding; returns (doc_vector, weights)."""
    centroid = embeddings.mean(axis=0)
    normed = embeddings / (np.linalg.norm(embeddings, axis=1, keepdims=True) + _EPS)
    scores = normed @ (centroid / (np.linalg.norm(centroid) + _EPS))
    weights = np.exp(scores - scores.max())
    weights /= weights.sum()
    return weights @ embeddings, weights


def doc_embedding_features(embeddings: np.ndarray) -> np.ndarray:
    """
    5 document-level features from sentence embeddings:
      0. Mean/max pool divergence — cosine distance between mean- and max-pooled vectors
         (low when every sentence points the same way).
      1. Redundancy — max cosine similarity between non-adjacent sentences
         (AI text tends to restate points); 0 with fewer than 3 sentences.
      2. Centroid spread — mean cosine distance of sentences from the document centroid
         (AI text tends to stay closer to one topic).
      3. PC1 variance ratio — share of embedding variance on the first principal
         component (high = sentences vary along a single direction).
      4. Attention entropy — normalised entropy of attention-pooling weights
         (1.0 = all sentences equally central).
    Returns zeros when fewer than 2 sentences are available.
    """
    if embeddings.ndim != 2 or embeddings.shape[0] < 2:
        return np.zeros(N_EMBEDDING_FEATURES)

    embeddings = embeddings.astype(np.float64)
    n = embeddings.shape[0]
    centroid = embeddings.mean(axis=0)

    mean_max_div = 1.0 - _cosine(centroid, embeddings.max(axis=0))

    normed = embeddings / (np.linalg.norm(embeddings, axis=1, keepdims=True) + _EPS)
    sims = normed @ normed.T
    non_adjacent = np.abs(np.subtract.outer(np.arange(n), np.arange(n))) >= 2
    redundancy = float(sims[non_adjacent].max()) if non_adjacent.any() else 0.0

    centroid_spread = float(np.mean([1.0 - _cosine(e, centroid) for e in embeddings]))

    singular_values = np.linalg.svd(embeddings - centroid, compute_uv=False)
    variances = singular_values ** 2
    pc1_ratio = float(variances[0] / variances.sum()) if variances.sum() > _EPS else 1.0

    _, weights = attention_pool(embeddings)
    attn_entropy = float(-np.sum(weights * np.log(weights + _EPS)) / np.log(n))

    return np.array([mean_max_div, redundancy, centroid_spread, pc1_ratio, attn_entropy])
