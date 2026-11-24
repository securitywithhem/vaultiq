"""Fine-tuned RoBERTa component (core.detector.finetuned_roberta_score) and its ensemble weight."""

import numpy as np
import torch
from transformers import RobertaConfig, RobertaForSequenceClassification

from core import detector


class _StubTokenizer:
    def __call__(self, text, return_tensors="pt", truncation=True, max_length=256):
        ids = [0] + [5 + (ord(c) % 40) for c in text[: max_length - 2]] + [2]
        return {"input_ids": torch.tensor([ids]), "attention_mask": torch.ones(1, len(ids), dtype=torch.long)}


def _tiny_model() -> RobertaForSequenceClassification:
    torch.manual_seed(0)
    cfg = RobertaConfig(vocab_size=64, hidden_size=16, num_hidden_layers=1, num_attention_heads=2,
                        intermediate_size=32, max_position_embeddings=300, num_labels=2)
    return RobertaForSequenceClassification(cfg).eval()


def test_neutral_when_checkpoint_absent(monkeypatch):
    monkeypatch.setattr(detector, "_finetuned_roberta", None)
    assert detector.finetuned_roberta_score("any text") == 0.5


def test_returns_ai_class_probability(monkeypatch):
    tok, mdl = _StubTokenizer(), _tiny_model()
    monkeypatch.setattr(detector, "_finetuned_roberta", (tok, mdl))
    text = "This is a sentence that the model will score."
    with torch.no_grad():
        expected = torch.softmax(mdl(**tok(text)).logits, dim=-1)[0, 1].item()
    score = detector.finetuned_roberta_score(text)
    assert 0.0 < score < 1.0
    assert np.isclose(score, expected)


def test_detect_blends_finetuned_weight(monkeypatch):
    monkeypatch.setattr(detector, "build_feature_vector", lambda t: np.zeros(25))
    monkeypatch.setattr(detector, "roberta_score", lambda t: 0.2)
    monkeypatch.setattr(detector, "lr_score_enhanced", lambda f: 0.4)
    monkeypatch.setattr(detector, "finetuned_roberta_score", lambda t: 1.0)
    monkeypatch.setattr(detector, "_W_ROBERTA", 0.5)
    monkeypatch.setattr(detector, "_W_LR", 0.25)
    monkeypatch.setattr(detector, "_W_NN", 0.0)
    monkeypatch.setattr(detector, "_W_FT", 0.25)
    result = detector.detect(["chunk one"])
    assert result["chunk_scores"] == [round(0.5 * 0.2 + 0.25 * 0.4 + 0.25 * 1.0, 2)]


def test_detect_ignores_finetuned_when_weight_zero(monkeypatch):
    monkeypatch.setattr(detector, "build_feature_vector", lambda t: np.zeros(25))
    monkeypatch.setattr(detector, "roberta_score", lambda t: 0.2)
    monkeypatch.setattr(detector, "lr_score_enhanced", lambda f: 0.4)
    monkeypatch.setattr(detector, "_W_ROBERTA", 0.5)
    monkeypatch.setattr(detector, "_W_LR", 0.5)
    monkeypatch.setattr(detector, "_W_NN", 0.0)
    monkeypatch.setattr(detector, "_W_FT", 0.0)

    def boom(_):
        raise AssertionError("fine-tuned model must not run when w_ft == 0")

    monkeypatch.setattr(detector, "finetuned_roberta_score", boom)
    assert detector.detect(["chunk one"])["chunk_scores"] == [0.3]
