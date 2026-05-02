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

# spaCy for NLP features
try:
    import spacy
    _SPACY_AVAILABLE = True
    _nlp = spacy.load("en_core_web_sm")
except ImportError:
    _SPACY_AVAILABLE = False
    _nlp = None

# Sentence-Transformers for semantic features
try:
    from sentence_transformers import SentenceTransformer
    _TRANSFORMERS_AVAILABLE = True
    _semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
except ImportError:
    _TRANSFORMERS_AVAILABLE = False
    _semantic_model = None

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
_DETECT_THRESHOLD: float = 0.55  # Loaded from ensemble_config.json at startup

# Global model references
_roberta_models: list = []   # list of (tokenizer, model, ai_idx) tuples
_roberta_model = None        # legacy compat ref (last loaded)
_roberta_tokenizer = None    # legacy compat ref (last loaded)
_lr_model = None
_gpt2_model = None
_gpt2_tokenizer = None
_using_dummy_lr: bool = False


def load_models() -> None:
    """Pre-load all required models for the ensemble."""
    global _roberta_model, _roberta_tokenizer, _lr_model, _using_dummy_lr, _gpt2_model, _gpt2_tokenizer
    global _W_ROBERTA, _W_LR, _DETECT_THRESHOLD, _roberta_models

    start_time = time.time()

    # Load ensemble blend weights if tuned config exists.
    if ENSEMBLE_CONFIG_PATH.exists():
        try:
            import json as _json
            with open(ENSEMBLE_CONFIG_PATH) as _f:
                _cfg = _json.load(_f)
            _W_ROBERTA = float(_cfg.get("w_roberta", _W_ROBERTA))
            _W_LR = float(_cfg.get("w_lr", _W_LR))
            _DETECT_THRESHOLD = float(_cfg.get("threshold", _DETECT_THRESHOLD))
            logger.info(f"Loaded ensemble weights: roberta={_W_ROBERTA:.3f} lr={_W_LR:.3f} threshold={_DETECT_THRESHOLD:.3f}")
        except Exception as e:
            logger.warning(f"Failed to load ensemble_config.json: {e}")

    if not _TORCH_AVAILABLE:
        logger.warning("torch/transformers not installed — running in statistical-only mode.")
    else:
        logger.info("Loading NLP models. This might take a moment...")
        try:
            # 1. Load RoBERTa checkpoints for text classification.
            # We use TWO checkpoints and average their AI probabilities:
            #   - Hello-SimpleAI/chatgpt-detector-roberta: trained on ChatGPT outputs (modern)
            #   - roberta-base-openai-detector: trained on GPT-2 outputs (catches older style)
            # Together they cover a wider range of model families.
            roberta_candidates = [
                "Hello-SimpleAI/chatgpt-detector-roberta",
                "roberta-base-openai-detector",
            ]
            _roberta_models = []
            for roberta_name in roberta_candidates:
                try:
                    tok = AutoTokenizer.from_pretrained(roberta_name)
                    mdl = AutoModelForSequenceClassification.from_pretrained(roberta_name)
                    mdl.eval()
                    # Determine AI label index for this checkpoint
                    id2label = getattr(mdl.config, "id2label", {})
                    ai_strs = {"fake", "chatgpt", "ai", "generated", "machine"}
                    ai_idx = 0
                    for idx, lbl in id2label.items():
                        if any(s in str(lbl).lower() for s in ai_strs):
                            ai_idx = int(idx)
                            break
                    _roberta_models.append((tok, mdl, ai_idx))
                    _roberta_tokenizer = tok   # legacy compat
                    _roberta_model = mdl       # legacy compat
                    logger.info(f"Loaded RoBERTa checkpoint: {roberta_name} (AI idx={ai_idx})")
                except Exception as _inner:
                    logger.warning(f"Skipped {roberta_name}: {_inner}")
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


def extract_spacy_features(text: str) -> np.ndarray:
    """
    COMPONENT 1B — spaCy-based NLP features (4 features)

    Computes 4 features from linguistic structure:
      0. Passive voice ratio (true dependency parsing, not keywords)
      1. POS diversity (grammatical variety)
      2. Named entity density (real NER, not capitalization)
      3. Dependency depth (syntactic complexity)
    """
    if not _SPACY_AVAILABLE or not _nlp:
        return np.zeros(4)

    if not text.strip():
        return np.zeros(4)

    try:
        doc = _nlp(text[:5000])
    except Exception as e:
        logger.warning(f"spaCy parsing failed: {e}")
        return np.zeros(4)

    # Feature 0: REAL Passive Voice (dependency: auxpass)
    passive_count = 0
    verb_count = 0
    for token in doc:
        if token.pos_ == "VERB":
            verb_count += 1
        if token.dep_ == "auxpass":
            passive_count += 1

    passive_ratio = passive_count / max(verb_count, 1)

    # Feature 1: POS Diversity (grammatical variety)
    pos_tags = set([token.pos_ for token in doc if token.pos_ != "SPACE"])
    pos_diversity = len(pos_tags) / max(len(doc), 1)

    # Feature 2: Named Entity Density (real NER, not capitalization heuristic)
    entity_count = len([ent for ent in doc.ents])
    entity_density = entity_count / max(len(doc), 1)

    # Feature 3: Average Dependency Depth (syntactic complexity)
    depths = []
    for token in doc:
        depth = 0
        current = token
        while current.head != current:
            depth += 1
            current = current.head
            if depth > 10:
                break
        depths.append(depth)

    avg_depth = np.mean(depths) if depths else 0.0

    return np.array([passive_ratio, pos_diversity, entity_density, avg_depth])


def extract_semantic_features(text: str) -> np.ndarray:
    """
    COMPONENT 1C — Transformers-based semantic features (3 features)

    Computes 3 features from sentence embeddings:
      0. Semantic coherence (sentence similarity, AI is repetitive)
      1. Semantic variance (diversity in semantic space)
      2. Average embedding norm (writing style intensity)
    """
    if not _TRANSFORMERS_AVAILABLE or not _semantic_model:
        return np.zeros(3)

    if not text.strip():
        return np.zeros(3)

    try:
        sentences = [s.strip() for s in text.replace('?', '.').replace('!', '.').split('.')
                     if s.strip() and len(s.strip()) > 20]

        if len(sentences) < 2:
            return np.zeros(3)

        sentences = sentences[:10]
        embeddings = _semantic_model.encode(sentences, convert_to_numpy=True)

    except Exception as e:
        logger.warning(f"Semantic embedding failed: {e}")
        return np.zeros(3)

    # Feature 0: Semantic Coherence (mean pairwise similarity)
    if len(embeddings) > 1:
        from sklearn.metrics.pairwise import cosine_similarity
        similarities = []
        for i in range(len(embeddings) - 1):
            sim = cosine_similarity([embeddings[i]], [embeddings[i+1]])[0][0]
            similarities.append(sim)
        semantic_coherence = np.mean(similarities)
    else:
        semantic_coherence = 0.5

    # Feature 1: Semantic Variance (std dev of similarities)
    if len(similarities) > 1:
        semantic_variance = np.std(similarities)
    else:
        semantic_variance = 0.0

    # Feature 2: Average Embedding Norm (magnitude of average embedding)
    avg_embedding = np.mean(embeddings, axis=0)
    avg_norm = np.linalg.norm(avg_embedding)

    return np.array([semantic_coherence, semantic_variance, avg_norm])


def roberta_score(text: str) -> float:
    """
    COMPONENT 2 — RoBERTa ensemble classifier

    Averages AI probabilities from ALL loaded RoBERTa checkpoints:
      - Hello-SimpleAI/chatgpt-detector-roberta (ChatGPT-era, modern)
      - roberta-base-openai-detector (GPT-2-era, legacy fallback)

    Returns probability [0, 1] that text is AI-generated.
    Returns 0.5 if no model is loaded (neutral score).
    """
    if not is_model_loaded():
        raise RuntimeError("Models are not loaded.")

    if not _roberta_models:
        # No transformer loaded — fall back to neutral
        return 0.5

    scores = []
    for (tok, mdl, ai_idx) in _roberta_models:
        try:
            inputs = tok(text, return_tensors="pt", truncation=True, max_length=512)
            with torch.no_grad():
                outputs = mdl(**inputs)
                probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
                scores.append(float(probs[0][ai_idx].item()))
        except Exception as e:
            logger.warning(f"RoBERTa scoring failed for one checkpoint: {e}")

    if not scores:
        return 0.5
    return float(sum(scores) / len(scores))


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


def lr_score_enhanced(features: np.ndarray) -> float:
    """
    COMPONENT 3B — Logistic Regression on 20-feature vector

    Accepts 20 features (13 custom + 4 spaCy + 3 semantic)
    Returns probability [0, 1]
    """
    if not is_model_loaded():
        raise RuntimeError("Models are not loaded.")

    try:
        assert _lr_model is not None, "LR Model not loaded"
        features_2d = features.reshape(1, -1)
        proba = _lr_model.predict_proba(features_2d)
        return float(proba[0][1])
    except Exception as e:
        logger.warning(f"LR scoring failed on 20-feature vector: {e}")
        return 0.5


def ensemble_score(text: str) -> float:
    """
    COMPONENT 4 — Meta ensemble

    Weighted average: _W_ROBERTA * mean(roberta checkpoints) + _W_LR * lr
    Weights and detection threshold are loaded at startup from
    models/ensemble_config.json (w_roberta, w_lr, threshold).
    """
    r_score = roberta_score(text)
    l_score = lr_score(text)
    return _W_ROBERTA * r_score + _W_LR * l_score


def detect(chunks: list[str]) -> dict[str, Any]:
    """
    COMPONENT 5 — Main entry point (UPDATED for 20 features)

    Runs the meta-ensemble over chunks and produces document-level verdict.
    Now uses 20-feature vector (13 custom + 4 spaCy + 3 semantic).
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
            # Extract all 20 features
            custom_feats = extract_features(chunk)           # 13
            spacy_feats = extract_spacy_features(chunk)      # 4
            semantic_feats = extract_semantic_features(chunk) # 3

            # Combine: 13 + 4 + 3 = 20 features
            all_features = np.concatenate([custom_feats, spacy_feats, semantic_feats])

            # Use RoBERTa + LR ensemble
            r_score = roberta_score(chunk)
            l_score = lr_score_enhanced(all_features)
            score = _W_ROBERTA * r_score + _W_LR * l_score

            chunk_scores.append(score)
        except Exception as e:
            logger.error(f"Error scoring chunk: {e}")
            chunk_scores.append(0.5)

    if not chunk_scores:
        avg_score = 0.0
    else:
        avg_score = sum(chunk_scores) / len(chunk_scores)

    avg_score = round(avg_score, 2)

    # Use configurable threshold (loaded from ensemble_config.json at startup).
    # human: score < threshold * 0.65,  mixed: up to threshold,  ai: >= threshold
    human_ceiling = _DETECT_THRESHOLD * 0.65
    if avg_score < human_ceiling:
        verdict = "human"
    elif avg_score < _DETECT_THRESHOLD:
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
