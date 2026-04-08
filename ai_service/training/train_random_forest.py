"""
training/train_random_forest.py — Train and save the RF classifier.

Steps:
  1. Load pre-processed Parquet splits from data/processed/
     (run data_loader.py first if files do not exist).
  2. Extract statistical + neural features for every sample.
  3. GridSearchCV with 5-fold CV over n_estimators and max_depth.
  4. Evaluate best model on test split.
  5. Save best model to models/rf_classifier.joblib.
  6. Print feature importances.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV

# Resolve project root
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config import (
    MODELS_DIR,
    PROCESSED_DIR,
    RANDOM_SEED,
    RF_CV_FOLDS,
    RF_MODEL_PATH,
    RF_PARAM_GRID,
)
from services.feature_extractor import TextFeatures, extract_features, load_gpt2
from services.preprocessor import preprocess

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger(__name__)

FEATURE_NAMES = [
    "perplexity",
    "burstiness",
    "entropy",
    "repetition_rate",
    "avg_sentence_length",
    "punctuation_density",
    "vocab_richness",
]


# ─── Feature Extraction ────────────────────────────────────────────────────────

def _extract_for_df(df: pd.DataFrame) -> np.ndarray:
    """Extract feature vectors for every row in a DataFrame."""
    rows: list[list[float]] = []
    total = len(df)
    for i, (_, row) in enumerate(df.iterrows(), 1):
        try:
            processed = preprocess(str(row["text"]))
            feats: TextFeatures = extract_features(
                processed.raw_text,
                processed.sentences,
                processed.clean_tokens,
            )
            rows.append(feats.to_vector())
        except Exception as exc:
            log.warning("Row %d/%d feature extraction failed: %s", i, total, exc)
            rows.append([1000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        if i % 500 == 0:
            log.info("  … %d/%d done", i, total)
    return np.array(rows, dtype=np.float32)


# ─── Main ─────────────────────────────────────────────────────────────────────

def train() -> None:
    # ── Load GPT-2 for perplexity ──────────────────────────────────────────────
    log.info("Loading GPT-2 for perplexity computation …")
    load_gpt2()

    # ── Load datasets ─────────────────────────────────────────────────────────
    processed_dir = Path(PROCESSED_DIR)
    train_path = processed_dir / "train.parquet"
    val_path   = processed_dir / "val.parquet"
    test_path  = processed_dir / "test.parquet"

    if not train_path.exists():
        log.info("Processed data not found — running data_loader …")
        from training.data_loader import build_dataset
        # Use optimized dataset sizes (~5 GB total)
        build_dataset(
            raid_max=20000,
            ai_pile_max=12000,
            paraphrase_max=8000,
        )

    train_df = pd.read_parquet(str(train_path))
    val_df   = pd.read_parquet(str(val_path))
    test_df  = pd.read_parquet(str(test_path))

    # Combine train + val for cross-validation (standard practice)
    cv_df = pd.concat([train_df, val_df], ignore_index=True).sample(
        frac=1, random_state=RANDOM_SEED
    )

    log.info("Extracting features for CV set (%d samples) …", len(cv_df))
    X_cv = _extract_for_df(cv_df)
    y_cv = cv_df["label"].values

    log.info("Extracting features for test set (%d samples) …", len(test_df))
    X_test = _extract_for_df(test_df)
    y_test = test_df["label"].values

    # ── Grid Search ───────────────────────────────────────────────────────────
    log.info("Starting GridSearchCV (%d folds) …", RF_CV_FOLDS)
    base_rf = RandomForestClassifier(
        class_weight="balanced",
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )
    grid = GridSearchCV(
        estimator=base_rf,
        param_grid=RF_PARAM_GRID,
        cv=RF_CV_FOLDS,
        scoring="roc_auc",
        verbose=1,
        n_jobs=-1,
    )
    grid.fit(X_cv, y_cv)

    best_rf: RandomForestClassifier = grid.best_estimator_
    log.info("Best params: %s", grid.best_params_)
    log.info("Best CV ROC-AUC: %.4f", grid.best_score_)

    # ── Test Set Evaluation ───────────────────────────────────────────────────
    y_pred = best_rf.predict(X_test)
    y_proba = best_rf.predict_proba(X_test)[:, 1]

    acc  = accuracy_score(y_test, y_pred)
    f1   = f1_score(y_test, y_pred, average="binary")
    auc  = roc_auc_score(y_test, y_proba)

    log.info("─── Test Set Results ───────────────────────")
    log.info("  Accuracy : %.4f", acc)
    log.info("  F1       : %.4f", f1)
    log.info("  ROC-AUC  : %.4f", auc)

    # ── Feature Importances ───────────────────────────────────────────────────
    importances = best_rf.feature_importances_
    log.info("─── Feature Importances ────────────────────")
    for name, imp in sorted(
        zip(FEATURE_NAMES, importances), key=lambda x: x[1], reverse=True
    ):
        log.info("  %-25s %.4f", name, imp)

    # ── Save Model ────────────────────────────────────────────────────────────
    models_dir = Path(MODELS_DIR)
    models_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(best_rf, RF_MODEL_PATH)
    log.info("Model saved → %s", RF_MODEL_PATH)


if __name__ == "__main__":
    train()
