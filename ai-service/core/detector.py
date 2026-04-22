"""
detector.py — AI-content detection pipeline.

Implements a meta-ensemble combining a fine-tuned RoBERTa classifier
and a logistic regression model over statistical text features.
"""

from __future__ import annotations

import logging
import string
import time
from collections import Counter
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from scipy.stats import entropy as scipy_entropy

try:
    import torch
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
    )
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False


# For logistic regression typing, not strictly required at runtime for inference
# as we load from joblib, but good for DUMMY class definition.

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent / "models"
LR_MODEL_PATH = MODELS_DIR / "lr_model_calibrated.pkl"  # Use calibrated model with Platt scaling
LR_MODEL_PATH_FALLBACK = MODELS_DIR / "lr_model.pkl"  # Fallback to uncalibrated if calibrated unavailable
ENSEMBLE_CONFIG_PATH = MODELS_DIR / "ensemble_config.json"

# Ensemble blend weights — overwritten at load time from ENSEMBLE_CONFIG_PATH if present.
_W_ROBERTA: float = 0.7
_W_LR: float = 0.3

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
    global _W_ROBERTA, _W_LR

    start_time = time.time()

    # Load ensemble blend weights if tuned config exists.
    if ENSEMBLE_CONFIG_PATH.exists():
        try:
            import json as _json
            with open(ENSEMBLE_CONFIG_PATH) as _f:
                _cfg = _json.load(_f)
            _W_ROBERTA = float(_cfg.get("w_roberta", _W_ROBERTA))
            _W_LR = float(_cfg.get("w_lr", _W_LR))
            logger.info(f"Loaded ensemble weights: roberta={_W_ROBERTA:.3f} lr={_W_LR:.3f}")
        except Exception as e:
            logger.warning(f"Failed to load ensemble_config.json: {e}")

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

    # Try calibrated model first (with Platt scaling), fallback to uncalibrated
    if LR_MODEL_PATH.exists():
        try:
            _lr_model = joblib.load(LR_MODEL_PATH)
            _using_dummy_lr = False
            logger.info(f"Loaded Calibrated Logistic Regression from {LR_MODEL_PATH}")
        except Exception as e:
            logger.warning(f"Calibrated LR model load failed: {e}, trying fallback...")
            if LR_MODEL_PATH_FALLBACK.exists():
                try:
                    _lr_model = joblib.load(LR_MODEL_PATH_FALLBACK)
                    _using_dummy_lr = False
                    logger.info(f"Loaded fallback Logistic Regression from {LR_MODEL_PATH_FALLBACK}")
                except Exception as e2:
                    logger.warning(f"Fallback LR model load failed: {e2}")
            else:
                logger.warning("LR model unavailable — using statistical heuristics only.")
    elif LR_MODEL_PATH_FALLBACK.exists():
        try:
            _lr_model = joblib.load(LR_MODEL_PATH_FALLBACK)
            _using_dummy_lr = False
            logger.info(f"Loaded Logistic Regression from {LR_MODEL_PATH_FALLBACK}")
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


def _count_formal_words(text: str) -> float:
    """Ratio of formal/academic vocabulary."""
    formal_words = {
        'however', 'therefore', 'thus', 'moreover', 'furthermore',
        'consequently', 'henceforth', 'methodology', 'hypothesis',
        'implementation', 'analysis', 'evaluation', 'framework',
        'significant', 'substantial', 'negligible', 'phenomenon',
        'investigation', 'systematic', 'rigorous', 'comprehensive',
    }
    words = [w.lower() for w in text.split()]
    if not words:
        return 0.0
    formal_count = sum(1 for w in words if w in formal_words)
    return formal_count / len(words)


def _count_citations(text: str) -> float:
    """Estimate citation/reference density."""
    citation_patterns = ['et al.', 'et al', 'et al,', '[1]', '[2]', 'ref.', 'reference',
                         'references', 'doi:', 'arxiv:', 'doi 10', '(smith', '(jones',
                         '(2020', '(2021', '(2022', '(2023', '(2024', '(2025', '(2026']
    count = sum(text.lower().count(pattern) for pattern in citation_patterns)
    # Normalize by text length
    return min(count / max(len(text), 1) * 100, 1.0)


def _count_technical_terms(text: str) -> float:
    """Ratio of technical/domain-specific terms."""
    technical_terms = {
        'algorithm', 'benchmark', 'dataset', 'validation', 'accuracy',
        'precision', 'recall', 'f1', 'f1-score', 'entropy', 'regression',
        'classification', 'optimization', 'convergence', 'gradient',
        'neural', 'network', 'layer', 'activation', 'weight', 'bias',
        'transformer', 'attention', 'embedding', 'tokenization',
    }
    words = [w.lower() for w in text.split()]
    if not words:
        return 0.0
    tech_count = sum(1 for w in words if w in technical_terms)
    return tech_count / len(words)


def _count_passive_voice(text: str) -> float:
    """Approximate passive voice ratio."""
    passive_markers = ['was ', 'were ', 'been ', 'is ', 'are ', 'being ']
    sentences = [s.strip() for s in text.replace('?', '.').replace('!', '.').split('.') if s.strip()]
    if not sentences:
        return 0.0
    passive_count = sum(1 for s in sentences if any(marker in s.lower() for marker in passive_markers))
    return passive_count / len(sentences)


def _count_complex_sentences(text: str) -> float:
    """Ratio of complex sentences (multiple clauses)."""
    clause_markers = [';', ' because ', ' although ', ' while ', ' when ', ' if ', ' since ', ' unless ']
    sentences = [s.strip() for s in text.replace('?', '.').replace('!', '.').split('.') if s.strip()]
    if not sentences:
        return 0.0
    complex_count = sum(1 for s in sentences if any(marker in s.lower() for marker in clause_markers))
    return complex_count / len(sentences)


def extract_features(text: str) -> np.ndarray:
    """
    COMPONENT 1 — Statistical feature extractor

    Computes 13 features from raw text:
      0. Perplexity proxy (avg log prob using GPT-2, or word length variance if unavailable)
      1. Burstiness (variance of sentence lengths / mean sentence length)
      2. Type-Token Ratio (unique words / total words)
      3. Average sentence length (mean word count per sentence)
      4. Punctuation density (punctuation characters / total characters)
      5. Entropy of word frequencies (semantic diversity)
      6. Average word length (stylometric marker)
      7. Named entity density approximation (capitalization patterns)
      8. Formal vocabulary ratio (academic words)
      9. Citation density (reference markers)
      10. Technical term ratio (domain-specific vocabulary)
      11. Passive voice ratio (grammatical structure)
      12. Complex sentence ratio (syntactic complexity)
    """
    if not text.strip():
        return np.zeros(13)

    # 1. Perplexity proxy (with fallback to word length variance)
    perplexity = 0.0
    if _gpt2_tokenizer is not None and _gpt2_model is not None:
        try:
            inputs = _gpt2_tokenizer(
                text, return_tensors="pt", truncation=True, max_length=1024
            )
            with torch.no_grad():
                outputs = _gpt2_model(inputs["input_ids"], labels=inputs["input_ids"])
                perplexity = torch.exp(outputs.loss).item()
        except Exception as e:
            pass

    # Fallback: use word length variance as proxy if perplexity is 0
    if perplexity == 0.0:
        words = text.split()
        if len(words) > 1:
            word_lengths = [len(w) for w in words]
            perplexity = float(np.var(word_lengths)) / (np.mean(word_lengths) + 0.1)

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

    # 6. Entropy of word frequencies (semantic diversity)
    if words:
        word_freq = Counter(w.lower() for w in words)
        freq_values = np.array(list(word_freq.values()))
        freq_prob = freq_values / freq_values.sum()
        word_entropy = -np.sum(freq_prob * np.log(freq_prob + 1e-10))
    else:
        word_entropy = 0.0

    # 7. Average word length (stylometric marker)
    if words:
        avg_word_len = np.mean([len(w) for w in words])
    else:
        avg_word_len = 0.0

    # 8. Named entity density approximation (capitalization patterns)
    capitalized_words = sum(1 for w in words if w and w[0].isupper())
    proper_noun_density = capitalized_words / max(total_words, 1)

    # 9-13. Academic-specific features
    formal_ratio = _count_formal_words(text)
    citation_density = _count_citations(text)
    tech_ratio = _count_technical_terms(text)
    passive_ratio = _count_passive_voice(text)
    complex_ratio = _count_complex_sentences(text)

    return np.array([
        perplexity, burstiness, ttr, avg_sent_len, punct_density,
        word_entropy, avg_word_len, proper_noun_density,
        formal_ratio, citation_density, tech_ratio, passive_ratio, complex_ratio
    ])


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
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
            # roberta-base-openai-detector: id2label = {0: 'Fake', 1: 'Real'}
            fake_prob = probs[0][0].item()
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

    Weighted average: _W_ROBERTA * roberta + _W_LR * lr
    Weights are tuned on a held-out set (see scripts/optimize_ensemble.py)
    and loaded at startup from models/ensemble_config.json.
    """
    r_score = roberta_score(text)
    l_score = lr_score(text)
    return _W_ROBERTA * r_score + _W_LR * l_score


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

    if avg_score < 0.35:
        verdict = "human"
    elif avg_score <= 0.65:
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
