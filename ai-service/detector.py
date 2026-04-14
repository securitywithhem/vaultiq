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

try:
    import torch
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
    )
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False

try:
    import similarity
    import similarity_ensemble
    _SIMILARITY_AVAILABLE = True
except Exception:
    _SIMILARITY_AVAILABLE = False

# For logistic regression typing, not strictly required at runtime for inference
# as we load from joblib, but good for DUMMY class definition.

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "models"
LR_MODEL_PATH = MODELS_DIR / "lr_model.pkl"

# Global model references
_roberta_model = None
_roberta_tokenizer = None
_lr_model = None
_gpt2_model = None
_gpt2_tokenizer = None
_using_dummy_lr: bool = False  # Fix 4: track whether LR is real or dummy


def load_models() -> None:
    """Pre-load all required models for the ensemble."""
    global _roberta_model, _roberta_tokenizer, _lr_model, _using_dummy_lr, _gpt2_model, _gpt2_tokenizer

    start_time = time.time()

    if not _TORCH_AVAILABLE:
        logger.warning("torch/transformers not installed — running in statistical-only mode.")
    else:
        logger.info("Loading NLP models. This might take a moment...")
        try:
            # 1. Load RoBERTa for text classification
            roberta_name = "roberta-base-openai-detector"
            _roberta_tokenizer = AutoTokenizer.from_pretrained(roberta_name)
            _roberta_model = AutoModelForSequenceClassification.from_pretrained(roberta_name)
            _roberta_model.eval()
        except Exception as e:
            logger.warning(f"RoBERTa load failed: {e}")

        try:
            # 2. Load GPT-2 for statistical perplexity feature
            from transformers import GPT2LMHeadModel, GPT2Tokenizer
            gpt2_name = "gpt2"
            _gpt2_tokenizer = GPT2Tokenizer.from_pretrained(gpt2_name)
            _gpt2_model = GPT2LMHeadModel.from_pretrained(gpt2_name)
            _gpt2_model.eval()
        except Exception as e:
            logger.warning(f"GPT-2 load failed: {e}")

    # 3. Load or create Logistic Regression model (always attempted — LR needs no torch)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if LR_MODEL_PATH.exists():
        try:
            _lr_model = joblib.load(LR_MODEL_PATH)
            _using_dummy_lr = False
            logger.info(f"Loaded Logistic Regression from {LR_MODEL_PATH}")
        except Exception as e:
            logger.warning(f"LR model load failed: {e}")

    if _lr_model is None:
        logger.warning("LR model unavailable — using statistical heuristics only.")
        _using_dummy_lr = True

        class DummyLR:
            def predict_proba(self, X: np.ndarray) -> np.ndarray:
                return np.full((X.shape[0], 2), 0.5)

        _lr_model = DummyLR()

    logger.info(f"Models ready in {time.time() - start_time:.2f}s.")


def is_model_loaded() -> bool:
    """Service is ready when the LR model is available (torch models are optional extras)."""
    return _lr_model is not None


def is_dummy_lr() -> bool:
    """Fix 4: Return True if the LR model is the dummy fallback (lr_model.pkl absent)."""
    return _using_dummy_lr


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

    # --- New: Similarity Integration ---
    # Aggregate similarity across all chunks
    overall_similarity: float = 0.0
    matched_excerpts: list[str] = []
    
    for chunk in chunks:
        if not chunk.strip():
            continue
        try:
            # Perform similarity search for each chunk
            # similarity.search returns (cosine, jaccard, semantic, matched_text)
            cosine, jaccard, semantic, matched_text = similarity.search(chunk)
            # similarity_ensemble computes weighted average
            s_agg = similarity_ensemble.aggregate_scores(cosine, jaccard, semantic, chunk, matched_text)
            overall_similarity += s_agg["plagiarism_score"]
            if s_agg["verdict"] != "original":
                # Keep track of significant matches
                matched_excerpts.append(s_agg["matched_excerpt"])
        except Exception as e:
            logger.error(f"Error computing similarity for chunk: {e}")

    final_similarity = round(overall_similarity / len(chunks) if chunks else 0.0, 4)
    # ------------------------------------

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
        # Integrated similarity metrics
        "similarity_score": final_similarity,
        "similarity_verdict": "high" if final_similarity > 0.65 else "medium" if final_similarity > 0.3 else "low",
        "top_matches": list(set(matched_excerpts))[:3] # unique excerpts
    }
