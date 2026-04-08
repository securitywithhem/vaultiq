"""
detector.py — AI-content detection pipeline.

Implements a meta-ensemble combining a fine-tuned RoBERTa classifier
and a logistic regression model over statistical text features.
"""

from __future__ import annotations

import logging
import string
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import torch
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    GPT2LMHeadModel,
    GPT2TokenizerFast,
)

# For logistic regression typing, not strictly required at runtime for inference
# as we load from joblib, but good for DUMMY class definition.

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "models"
LR_MODEL_PATH = MODELS_DIR / "lr_model.pkl"

# Global model references
_gpt2_model = None
_gpt2_tokenizer = None
_roberta_model = None
_roberta_tokenizer = None
_lr_model = None


def load_models() -> None:
    """Pre-load all required models for the ensemble."""
    global _gpt2_model, _gpt2_tokenizer, _roberta_model, _roberta_tokenizer, _lr_model

    start_time = time.time()
    logger.info("Loading NLP models. This might take a moment...")

    # 1. Load GPT2 for perplexity scoring
    _gpt2_tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")
    _gpt2_model = GPT2LMHeadModel.from_pretrained("gpt2")
    _gpt2_model.eval()

    # 2. Load RoBERTa for text classification
    roberta_name = "roberta-base-openai-detector"
    _roberta_tokenizer = AutoTokenizer.from_pretrained(roberta_name)
    _roberta_model = AutoModelForSequenceClassification.from_pretrained(roberta_name)
    _roberta_model.eval()

    # 3. Load or create Logistic Regression model
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if LR_MODEL_PATH.exists():
        _lr_model = joblib.load(LR_MODEL_PATH)
        logger.info(f"Loaded Logistic Regression from {LR_MODEL_PATH}")
    else:
        logger.info("lr_model.pkl not found. Creating a DUMMY model.")

        class DummyLR:
            def predict_proba(self, X: np.ndarray) -> np.ndarray:
                # Shape (batch_size, n_classes) - index 1 is AI
                return np.full((X.shape[0], 2), 0.5)

        _lr_model = DummyLR()
        try:
            joblib.dump(_lr_model, LR_MODEL_PATH)
        except Exception as e:
            logger.warning(f"Failed to save dummy model: {e}")

    logger.info(f"Models loaded in {time.time() - start_time:.2f} seconds.")


def is_model_loaded() -> bool:
    """Check whether the ML models have been initialised."""
    return all(
        m is not None
        for m in (
            _gpt2_model,
            _gpt2_tokenizer,
            _roberta_model,
            _roberta_tokenizer,
            _lr_model,
        )
    )


def extract_features(text: str) -> np.ndarray:
    """
    COMPONENT 1 — Statistical feature extractor

    Computes 5 features from raw text:
      0. Perplexity proxy (avg log prob using GPT-2)
      1. Burstiness (variance of sentence lengths / mean sentence length)
      2. Type-Token Ratio (unique words / total words)
      3. Average sentence length (mean word count per sentence)
      4. Punctuation density (punctuation characters / total characters)
    """
    if not text.strip():
        return np.zeros(5)

    # 1. Perplexity proxy
    try:
        assert _gpt2_tokenizer is not None, "Tokenizer not loaded"
        assert _gpt2_model is not None, "Model not loaded"
        inputs = _gpt2_tokenizer(
            text, return_tensors="pt", truncation=True, max_length=1024
        )
        with torch.no_grad():
            outputs = _gpt2_model(inputs["input_ids"], labels=inputs["input_ids"])
            perplexity = torch.exp(outputs.loss).item()
    except Exception as e:
        logger.warning(f"Failed to compute perplexity: {e}")
        perplexity = 0.0

    # Parse basic structural lists
    sentences = [s.strip() for s in text.replace('?', '.').replace('!', '.').split('.') if s.strip()]
    words = text.split()
    total_words = len(words)
    total_chars = len(text)

    # 2. Burstiness & 4. Avg Sentence Length
    if sentences:
        lengths = [len(s.split()) for s in sentences]
        mean_len = float(np.mean(lengths))
        variance_len = float(np.var(lengths))
        burstiness = variance_len / mean_len if mean_len > 0 else 0.0
        avg_sent_len = mean_len
    else:
        burstiness = 0.0
        avg_sent_len = 0.0

    # 3. Type-Token Ratio
    if total_words > 0:
        unique_words = len(set(w.lower() for w in words))
        ttr = unique_words / total_words
    else:
        ttr = 0.0

    # 5. Punctuation density
    if total_chars > 0:
        punct_count = sum(1 for c in text if c in string.punctuation)
        punct_density = punct_count / total_chars
    else:
        punct_density = 0.0

    return np.array([perplexity, burstiness, ttr, avg_sent_len, punct_density])


def roberta_score(text: str) -> float:
    """
    COMPONENT 2 — RoBERTa classifier

    Returns probability [0, 1] for class 'Fake' (index 1).
    """
    if not is_model_loaded():
        raise RuntimeError("Models are not loaded.")

    try:
        assert _roberta_tokenizer is not None, "Tokenizer not loaded"
        assert _roberta_model is not None, "Model not loaded"
        inputs = _roberta_tokenizer(
            text, return_tensors="pt", truncation=True, max_length=512
        )
        with torch.no_grad():
            outputs = _roberta_model(**inputs)
            # Softmax to get probabilities
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
            # Index 1 is often 'Fake'/'AI-generated' for openai-detector models
            fake_prob = probs[0][1].item()
            return float(fake_prob)
    except Exception as e:
        logger.warning(f"RoBERTa scoring failed: {e}")
        return 0.5


def lr_score(text: str) -> float:
    """
    COMPONENT 3 — Logistic Regression on statistical features

    Returns probability [0, 1]
    """
    if not is_model_loaded():
        raise RuntimeError("Models are not loaded.")

    try:
        assert _lr_model is not None, "LR Model not loaded"
        features = extract_features(text).reshape(1, -1)
        proba = _lr_model.predict_proba(features)
        # Class 1 is assumed to represent AI
        return float(proba[0][1])
    except Exception as e:
        logger.warning(f"LR scoring failed: {e}")
        return 0.5


def ensemble_score(text: str) -> float:
    """
    COMPONENT 4 — Meta ensemble

    Weighted average: 0.7 * roberta + 0.3 * lr
    """
    r_score = roberta_score(text)
    l_score = lr_score(text)
    return 0.7 * r_score + 0.3 * l_score


def detect(chunks: list[str]) -> dict[str, Any]:
    """
    COMPONENT 5 — Main entry point

    Runs the meta-ensemble over chunks and produces document-level verdict.
    """
    if not chunks:
        return {
            "score": 0.0,
            "verdict": "human",
            "confidence": "low",
            "chunk_scores": [],
            "warning": "No valid text content found.",
        }

    chunk_scores: list[float] = []

    for chunk in chunks:
        if not chunk.strip():
            continue
        try:
            score = ensemble_score(chunk)
            chunk_scores.append(score)
        except Exception as e:
            logger.error(f"Error scoring chunk: {e}")
            chunk_scores.append(0.5)

    if not chunk_scores:
        avg_score = 0.0
    else:
        avg_score = sum(chunk_scores) / len(chunk_scores)

    avg_score = round(avg_score, 2)

    if avg_score < 0.4:
        verdict = "human"
    elif avg_score <= 0.7:
        verdict = "mixed"
    else:
        verdict = "ai_generated"

    warning = None
    if len(chunks) < 3:
        warning = "Low chunk count (< 3). Score may be unreliable."

    if len(chunk_scores) > 5 and warning is None:
        confidence = "high"
    elif warning is None:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "score": avg_score,
        "verdict": verdict,
        "confidence": confidence,
        "chunk_scores": [round(s, 2) for s in chunk_scores],
        "warning": warning,
    }
