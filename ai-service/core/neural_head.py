"""
neural_head.py — MLP classifier over [chunk embedding ‖ standardized hand-crafted features].

Weights live in a .pt state dict; architecture and feature scaling live in a JSON
sidecar so the model can be rebuilt without pickling Python objects.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from torch import nn


class NeuralHead(nn.Module):
    def __init__(self, n_inputs: int, hidden: tuple[int, ...] = (128, 32), dropout: float = 0.2):
        super().__init__()
        layers: list[nn.Module] = []
        d = n_inputs
        for h in hidden:
            layers += [nn.Linear(d, h), nn.BatchNorm1d(h), nn.ReLU(), nn.Dropout(dropout)]
            d = h
        layers.append(nn.Linear(d, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)


class NeuralScorer:
    """Inference wrapper: standardizes features, concatenates the embedding, returns P(AI)."""

    def __init__(self, model: NeuralHead, emb_dim: int, feat_mean: np.ndarray, feat_std: np.ndarray, hidden: tuple[int, ...]):
        self.model = model.eval()
        self.emb_dim = emb_dim
        self.feat_mean = feat_mean.astype(np.float32)
        self.feat_std = feat_std.astype(np.float32)
        self.hidden = hidden

    @property
    def n_features(self) -> int:
        return len(self.feat_mean)

    def inputs(self, embeddings: np.ndarray, features: np.ndarray) -> np.ndarray:
        """(n, emb_dim) + (n, n_features) → (n, emb_dim + n_features) model input."""
        scaled = (features.astype(np.float32) - self.feat_mean) / self.feat_std
        return np.concatenate([embeddings.astype(np.float32), scaled], axis=1)

    def predict_proba(self, embeddings: np.ndarray, features: np.ndarray) -> np.ndarray:
        x = torch.from_numpy(self.inputs(np.atleast_2d(embeddings), np.atleast_2d(features)))
        with torch.no_grad():
            return torch.sigmoid(self.model(x)).numpy()

    def save(self, weights_path: Path, meta_path: Path) -> None:
        torch.save(self.model.state_dict(), weights_path)
        meta_path.write_text(json.dumps({
            "emb_dim": self.emb_dim,
            "hidden": list(self.hidden),
            "feat_mean": self.feat_mean.tolist(),
            "feat_std": self.feat_std.tolist(),
        }, indent=2))

    @classmethod
    def load(cls, weights_path: Path, meta_path: Path) -> "NeuralScorer":
        meta = json.loads(meta_path.read_text())
        hidden = tuple(meta["hidden"])
        feat_mean = np.array(meta["feat_mean"])
        model = NeuralHead(meta["emb_dim"] + len(feat_mean), hidden)
        model.load_state_dict(torch.load(weights_path, map_location="cpu"))
        return cls(model, meta["emb_dim"], feat_mean, np.array(meta["feat_std"]), hidden)
