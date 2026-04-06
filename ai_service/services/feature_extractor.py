"""
services/feature_extractor.py — Statistical and neural feature extraction
for AI text detection.

Features computed:
  1. perplexity        — GPT-2 log-likelihood (low value → AI-like)
  2. burstiness        — Variance/mean of sentence lengths (low → AI-like)
  3. entropy           — Shannon entropy over token unigrams
  4. repetition_rate   — Duplicate 4-grams / total 4-grams
  5. avg_sentence_len  — Mean token count per sentence
  6. punct_density     — Punctuation chars / total chars
  7. vocab_richness    — Unique tokens / total tokens (type-token ratio)
"""

from __future__ import annotations

import math
import string
from collections import Counter
from dataclasses import dataclass
from typing import List, Optional

import numpy as np
import torch
from transformers import GPT2LMHeadModel, GPT2TokenizerFast

from config import GPT2_MODEL_ID

# ─── Module-level GPT-2 singleton (loaded once via app lifespan) ─────────────
_gpt2_tokenizer: Optional[GPT2TokenizerFast] = None
_gpt2_model: Optional[GPT2LMHeadModel] = None
_device: str = "cpu"


def load_gpt2() -> None:
    """
    Load GPT-2 small model and tokenizer into module-level singletons.
    Must be called once during application startup.
    """
    global _gpt2_tokenizer, _gpt2_model, _device
    _gpt2_tokenizer = GPT2TokenizerFast.from_pretrained(GPT2_MODEL_ID)
    _gpt2_tokenizer.pad_token = _gpt2_tokenizer.eos_token
    _gpt2_model = GPT2LMHeadModel.from_pretrained(GPT2_MODEL_ID)
    _device = "cuda" if torch.cuda.is_available() else "cpu"
    _gpt2_model.to(_device)
    _gpt2_model.eval()


@dataclass
class TextFeatures:
    perplexity: float
    burstiness: float
    entropy: float
    repetition_rate: float
    avg_sentence_length: float
    punctuation_density: float
    vocab_richness: float

    def to_vector(self) -> List[float]:
        """Return features as an ordered list for ML model input."""
        return [
            self.perplexity,
            self.burstiness,
            self.entropy,
            self.repetition_rate,
            self.avg_sentence_length,
            self.punctuation_density,
            self.vocab_richness,
        ]


# ─── Individual Feature Functions ─────────────────────────────────────────────

def compute_perplexity(text: str, max_length: int = 512) -> float:
    """
    Compute GPT-2 perplexity for the given text.

    perplexity = exp(-1/N * Σ log P(token_i | context))

    A lower perplexity indicates smoother, more predictable text (AI-like).
    Returns 1000.0 as a sentinel if GPT-2 is not loaded or text is too short.
    """
    if _gpt2_model is None or _gpt2_tokenizer is None:
        return 1000.0
    try:
        inputs = _gpt2_tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=max_length,
        )
        input_ids: torch.Tensor = inputs["input_ids"].to(_device)
        if input_ids.shape[1] < 2:
            return 1000.0
        with torch.no_grad():
            outputs = _gpt2_model(input_ids, labels=input_ids)
            loss: float = outputs.loss.item()   # mean NLL per token
        perplexity = math.exp(loss)
        return float(np.clip(perplexity, 0.0, 50000.0))
    except Exception:
        return 1000.0


def compute_burstiness(sentences: List[str]) -> float:
    """
    Compute burstiness as variance of sentence token lengths / mean length.

    High burstiness → varied sentence lengths (human-like).
    Low burstiness  → uniform sentence lengths (AI-like).
    Returns 0.0 if fewer than 2 sentences.
    """
    if len(sentences) < 2:
        return 0.0
    lengths = [len(s.split()) for s in sentences]
    mean_len = float(np.mean(lengths))
    if mean_len == 0.0:
        return 0.0
    variance = float(np.var(lengths))
    return variance / mean_len


def compute_entropy(tokens: List[str]) -> float:
    """
    Compute Shannon entropy over the unigram token distribution.

    entropy = -Σ p_i * log2(p_i)

    Higher entropy → more diverse vocabulary (human-like).
    Returns 0.0 for empty token lists.
    """
    if not tokens:
        return 0.0
    counts = Counter(tokens)
    total = len(tokens)
    entropy = -sum(
        (count / total) * math.log2(count / total)
        for count in counts.values()
        if count > 0
    )
    return float(entropy)


def compute_repetition_rate(tokens: List[str]) -> float:
    """
    Compute the fraction of duplicate 4-grams relative to total 4-grams.

    repetition_rate = duplicate_4grams / total_4grams

    AI text tends to repeat phrases more than human text.
    Returns 0.0 if fewer than 4 tokens.
    """
    if len(tokens) < 4:
        return 0.0
    ngrams = [tuple(tokens[i : i + 4]) for i in range(len(tokens) - 3)]
    total = len(ngrams)
    counts = Counter(ngrams)
    duplicates = sum(c - 1 for c in counts.values() if c > 1)
    return duplicates / total


def compute_avg_sentence_length(sentences: List[str]) -> float:
    """Average number of whitespace-delimited tokens per sentence."""
    if not sentences:
        return 0.0
    lengths = [len(s.split()) for s in sentences]
    return float(np.mean(lengths))


def compute_punctuation_density(raw_text: str) -> float:
    """Fraction of characters that are punctuation marks."""
    if not raw_text:
        return 0.0
    punct_chars = sum(1 for ch in raw_text if ch in string.punctuation)
    return punct_chars / len(raw_text)


def compute_vocab_richness(tokens: List[str]) -> float:
    """Type-token ratio: unique tokens / total tokens."""
    if not tokens:
        return 0.0
    return len(set(tokens)) / len(tokens)


# ─── Combined Extractor ────────────────────────────────────────────────────────

def extract_features(
    raw_text: str,
    sentences: List[str],
    all_tokens: List[str],
) -> TextFeatures:
    """
    Extract all statistical and neural features from preprocessed text.

    Args:
        raw_text:   Original text (with punctuation) for perplexity & density.
        sentences:  Sentence-tokenized list from raw_text.
        all_tokens: Word tokens (may include punctuation-free version).

    Returns:
        TextFeatures dataclass with all seven features populated.
    """
    try:
        perplexity = compute_perplexity(raw_text)
        burstiness = compute_burstiness(sentences)
        entropy = compute_entropy(all_tokens)
        repetition_rate = compute_repetition_rate(all_tokens)
        avg_sentence_length = compute_avg_sentence_length(sentences)
        punctuation_density = compute_punctuation_density(raw_text)
        vocab_richness = compute_vocab_richness(all_tokens)

        return TextFeatures(
            perplexity=perplexity,
            burstiness=burstiness,
            entropy=entropy,
            repetition_rate=repetition_rate,
            avg_sentence_length=avg_sentence_length,
            punctuation_density=punctuation_density,
            vocab_richness=vocab_richness,
        )
    except Exception as exc:
        raise RuntimeError(f"Feature extraction failed: {exc}") from exc
