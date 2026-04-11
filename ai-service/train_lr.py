#!/usr/bin/env python3
"""
train_lr.py — Train logistic regression model for AI content detection.

Loads corpus.csv, creates balanced AI/human dataset, and trains LR on
statistical features extracted by detector.extract_features().

Output: models/lr_model.pkl (scikit-learn LogisticRegression)
"""

import logging
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
import joblib

# Add ai-service to path to import detector
sys.path.insert(0, str(Path(__file__).parent))

from detector import extract_features

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

CORPUS_CSV = Path(__file__).parent / "datasets" / "corpus.csv"
LR_MODEL_PATH = Path(__file__).parent / "models" / "lr_model.pkl"


def create_synthetic_human_text(ai_text: str, degradation_level: float = 0.5) -> str:
    """
    Create synthetic 'human-like' text from AI-generated text by applying
    degradations: sentence shuffling, punctuation removal, word repetition.

    Args:
        ai_text: Original AI-generated text
        degradation_level: How much to degrade (0.0 = no change, 1.0 = heavy degradation)

    Returns:
        Modified text that looks less like polished AI output
    """
    if not ai_text.strip():
        return ai_text

    # Split into sentences
    sentences = [s.strip() for s in ai_text.replace("?", ".").replace("!", ".").split(".") if s.strip()]

    if len(sentences) < 2:
        return ai_text

    # Apply random sentence shuffling
    if random.random() < degradation_level * 0.7:
        random.shuffle(sentences)

    # Randomly drop some punctuation and capitalization
    if random.random() < degradation_level * 0.5:
        sentences = [s.lower() if random.random() < 0.3 else s for s in sentences]

    # Occasionally repeat words to simulate human speech patterns
    if random.random() < degradation_level * 0.3:
        idx = random.randint(0, len(sentences) - 1)
        words = sentences[idx].split()
        if len(words) > 1:
            repeat_idx = random.randint(0, len(words) - 1)
            words.insert(repeat_idx, words[repeat_idx])
            sentences[idx] = " ".join(words)

    return ". ".join(sentences) + "."


def load_and_prepare_data(max_samples_per_class: int = 10000) -> tuple:
    """
    Load corpus.csv, create balanced AI/human dataset.

    Args:
        max_samples_per_class: Max samples to use for each class (budget for training)

    Returns:
        (X: np.ndarray of features, y: np.ndarray of labels)
    """
    if not CORPUS_CSV.exists():
        logger.error(f"Corpus CSV not found at {CORPUS_CSV}")
        sys.exit(1)

    logger.info(f"Loading corpus from {CORPUS_CSV}...")
    df = pd.read_csv(CORPUS_CSV)
    logger.info(f"Loaded {len(df)} documents from corpus")

    # All documents are AI-generated (gpt_wiki_intro)
    ai_texts = df["text"].dropna().astype(str).tolist()

    # Create two balanced classes
    logger.info(f"Preparing balanced dataset ({max_samples_per_class} per class)...")

    # Class 1: AI-generated (use as-is)
    ai_sample = random.sample(ai_texts, min(max_samples_per_class, len(ai_texts)))

    # Class 0: Synthetic "human" (degraded AI text)
    human_sample = []
    for _ in range(max_samples_per_class):
        ai_text = random.choice(ai_texts)
        human_text = create_synthetic_human_text(ai_text, degradation_level=0.7)
        human_sample.append(human_text)

    # Combine and create labels
    all_texts = human_sample + ai_sample
    labels = np.array([0] * len(human_sample) + [1] * len(ai_sample))

    logger.info(f"Extracting features from {len(all_texts)} documents...")
    features = []

    for i, text in enumerate(all_texts):
        if (i + 1) % 1000 == 0:
            logger.info(f"  Processed {i + 1}/{len(all_texts)}")

        try:
            feat = extract_features(text)
            # Ensure valid features (no NaN, no Inf)
            if np.all(np.isfinite(feat)):
                features.append(feat)
            else:
                # Use fallback: all-zero features
                logger.warning(f"Invalid features for document {i}, using zero vector")
                features.append(np.zeros(5))
        except Exception as e:
            logger.warning(f"Failed to extract features for doc {i}: {e}, using zero vector")
            features.append(np.zeros(5))

    X = np.array(features)
    logger.info(f"Feature matrix shape: {X.shape}")
    logger.info(f"Feature statistics:\n{pd.DataFrame(X).describe()}")

    return X, labels


def train_and_save(X: np.ndarray, y: np.ndarray) -> None:
    """
    Train logistic regression model and save to disk.

    Args:
        X: Feature matrix (n_samples, n_features)
        y: Binary labels (0=human, 1=ai)
    """
    logger.info("Training Logistic Regression model...")

    lr = LogisticRegression(
        max_iter=1000,
        random_state=42,
        C=1.0,
        solver="lbfgs",
        n_jobs=-1
    )

    # Cross-validation
    logger.info("Running 5-fold cross-validation...")
    cv_scores = cross_val_score(lr, X, y, cv=5, scoring="accuracy")
    logger.info(f"Cross-validation scores: {cv_scores}")
    logger.info(f"Mean CV accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

    # Train on full dataset
    logger.info("Training on full dataset...")
    lr.fit(X, y)

    # Save model
    LR_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(lr, LR_MODEL_PATH)
    logger.info(f"✅ Model saved to {LR_MODEL_PATH}")

    # Print model info
    logger.info(f"Model coefficients shape: {lr.coef_.shape}")
    logger.info(f"Model intercept: {lr.intercept_}")
    logger.info(f"Classes: {lr.classes_}")


def main():
    """Main training pipeline."""
    logger.info("=" * 60)
    logger.info("VaultIQ LR Model Training")
    logger.info("=" * 60)

    try:
        X, y = load_and_prepare_data(max_samples_per_class=10000)
        train_and_save(X, y)
        logger.info("=" * 60)
        logger.info("✅ Training complete!")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"Training failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
