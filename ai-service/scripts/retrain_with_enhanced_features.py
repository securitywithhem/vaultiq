"""
Retrain the calibrated HistGradientBoosting "LR" model on the 25-feature vector
(13 custom + 4 spaCy + 3 semantic + 5 document-embedding).

Also trains the same model on the first 20 features as an ablation, so the effect of the
embedding features is measured on the held-out domains rather than assumed.

Usage:
    cd ai-service
    python scripts/training_data.py download   # once
    python scripts/retrain_with_enhanced_features.py [--max-per-class 12000] [--rebuild]
"""

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from training_data import AI_SERVICE, SEED, load_features, metrics  # noqa: E402

from core.embeddings import EMBEDDING_FEATURE_NAMES, N_EMBEDDING_FEATURES  # noqa: E402

MODELS = AI_SERVICE / "models"
N_FEATURES = 13 + 4 + 3 + N_EMBEDDING_FEATURES
N_BASELINE = 20

CLF_PARAMS = dict(
    max_iter=800,
    learning_rate=0.05,
    max_depth=8,
    min_samples_leaf=60,
    l2_regularization=1.5,
    random_state=SEED,
    class_weight="balanced",
    early_stopping=True,
    validation_fraction=0.12,
    n_iter_no_change=40,
)


def fit_calibrated(X: np.ndarray, y: np.ndarray) -> CalibratedClassifierCV:
    pipe = Pipeline([("scaler", RobustScaler()), ("clf", HistGradientBoostingClassifier(**CLF_PARAMS))])
    cal = CalibratedClassifierCV(pipe, method="isotonic", cv=5)
    cal.fit(X, y)
    return cal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-per-class", type=int, default=12000)
    ap.add_argument("--eval-per-class", type=int, default=1500)
    ap.add_argument("--rebuild", action="store_true", help="recompute cached features")
    args = ap.parse_args()

    tr = load_features("train", args.max_per_class, args.rebuild)
    va = load_features("val", args.eval_per_class, args.rebuild)
    te = load_features("test", args.eval_per_class, args.rebuild)
    print(f"\n📐 train={len(tr['y']):,}  val={len(va['y']):,}  test(held-out domains)={len(te['y']):,}")

    results = {}
    models = {}
    for name, n in (("baseline_20", N_BASELINE), ("enhanced_25", N_FEATURES)):
        print(f"\n⚙️  Training {name} ({n} features)...")
        model = fit_calibrated(tr["X"][:, :n], tr["y"])
        models[name] = model
        results[name] = {
            "val": metrics(va["y"], model.predict_proba(va["X"][:, :n])[:, 1]),
            "test_heldout_domains": metrics(te["y"], model.predict_proba(te["X"][:, :n])[:, 1]),
        }
        print(f"   val  {results[name]['val']}")
        print(f"   test {results[name]['test_heldout_domains']}")

    delta = results["enhanced_25"]["test_heldout_domains"]["roc_auc"] - results["baseline_20"]["test_heldout_domains"]["roc_auc"]
    print(f"\n📊 Held-out AUC change from embedding features: {delta:+.4f}")

    joblib.dump(models["enhanced_25"], MODELS / "lr_model_v6_calibrated.pkl")
    with open(MODELS / "training_metrics_v6.json", "w") as f:
        json.dump({
            "n_features": N_FEATURES,
            "features": {"custom": 13, "spacy": 4, "semantic": 3, "doc_embedding": list(EMBEDDING_FEATURE_NAMES)},
            "n_train": int(len(tr["y"])),
            "n_val": int(len(va["y"])),
            "n_test": int(len(te["y"])),
            "test_domains": "HC3 medicine + wiki_csai (not seen in training)",
            "results": results,
            "clf_params": CLF_PARAMS,
        }, f, indent=2)
    print(f"💾 {MODELS / 'lr_model_v6_calibrated.pkl'}  (+ training_metrics_v6.json)")


if __name__ == "__main__":
    main()
