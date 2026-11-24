"""
Ensemble optimization — tune w_roberta / w_lr / w_nn and the decision threshold.

Scores come from the models core.detector actually serves (both RoBERTa checkpoints,
the LR model it loads, and the neural head if present) on serving-style chunks.
By default (--tune-on wiki_csai) weights and threshold are tuned on the held-out HC3
domain wiki_csai and reported on medicine: the val split shares domains with training,
so tuning there rewards models that overfit those domains (it gave the fine-tuned RoBERTa
w_ft=0.8 and cost 14 points of held-out F1). --tune-on val restores the old behaviour.

Produces models/ensemble_config.json (or --out).

Usage:
    cd ai-service
    python scripts/optimize_ensemble.py [--eval-per-class 1500] [--tune-on wiki_csai|val] [--out path]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from training_data import (  # noqa: E402
    AI_SERVICE, _detector, finetuned_roberta_scores, load_features, metrics, roberta_scores,
)

CONFIG_PATH = AI_SERVICE / "models" / "ensemble_config.json"
LEGACY_LR_PATH = AI_SERVICE / "models" / "lr_model.pkl"
STEP = 0.05
THRESHOLDS = np.round(np.arange(0.20, 0.81, 0.02), 2)


def legacy_lr_scores(split: str, per_class: int) -> np.ndarray | None:
    """The pre-existing lr_model.pkl, for a before/after comparison of the whole system.
    Skipped with a fine-tuned embedding model: the legacy model was trained on stock-MiniLM features."""
    from core.detector import EMBEDDING_MODEL_ID
    if not LEGACY_LR_PATH.exists() or EMBEDDING_MODEL_ID != "all-MiniLM-L6-v2":
        return None
    import joblib
    d = load_features(split, per_class)
    model = joblib.load(LEGACY_LR_PATH)
    return model.predict_proba(d["X"][:, : getattr(model, "n_features_in_", 20)])[:, 1]


def component_scores(split: str, per_class: int) -> tuple[dict[str, np.ndarray], np.ndarray]:
    d = load_features(split, per_class)
    det = _detector()
    lr = det._lr_model
    n_lr = getattr(lr, "n_features_in_", d["X"].shape[1])
    scores = {
        "roberta": roberta_scores(split, per_class, d["texts"]),
        "lr": lr.predict_proba(d["X"][:, :n_lr])[:, 1],
    }
    if det._neural_scorer is not None:
        ns = det._neural_scorer
        scores["nn"] = ns.predict_proba(d["E"], d["X"][:, : ns.n_features])
    ft = finetuned_roberta_scores(split, per_class, d["texts"])
    if ft is not None:
        scores["ft"] = ft
    return scores, d["y"]


def blend(scores: dict[str, np.ndarray], w: dict[str, float]) -> np.ndarray:
    return sum(w.get(k, 0.0) * s for k, s in scores.items())


def f1_at(y: np.ndarray, prob: np.ndarray, thr: float) -> float:
    pred = prob >= thr
    tp = np.sum(pred & (y == 1))
    return 2 * tp / max(pred.sum() + (y == 1).sum(), 1)


def best_threshold(y: np.ndarray, prob: np.ndarray) -> tuple[float, float]:
    """(best F1, threshold) over THRESHOLDS, vectorised."""
    pred = prob[:, None] >= THRESHOLDS[None, :]
    tp = (pred & (y[:, None] == 1)).sum(axis=0)
    f1 = 2 * tp / np.maximum(pred.sum(axis=0) + (y == 1).sum(), 1)
    i = int(np.argmax(f1))
    return float(f1[i]), float(THRESHOLDS[i])


def test_sources(per_class: int, n_expected: int) -> np.ndarray:
    """HC3 domain of every cached test chunk (load_chunks is deterministic, same order as the cache)."""
    from training_data import load_chunks
    rows = load_chunks("test", per_class)
    assert len(rows) == n_expected, "test chunks no longer match the feature cache"
    return np.array([r["source"].removeprefix("hc3_") for r in rows])


def subset(scores: dict[str, np.ndarray], mask: np.ndarray) -> dict[str, np.ndarray]:
    return {k: s[mask] for k, s in scores.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval-per-class", type=int, default=1500)
    ap.add_argument("--exclude-nn", action="store_true",
                    help="force w_nn=0 (the val split shares domains with training, which rewards the head's topic overfitting)")
    ap.add_argument("--tune-on", choices=["val", "wiki_csai"], default="wiki_csai",
                    help="val: tune on the in-domain val split (rewards in-domain overfitting). "
                         "wiki_csai: tune on that held-out HC3 domain and report on medicine, "
                         "which no model trained or was tuned on.")
    ap.add_argument("--out", type=Path, default=CONFIG_PATH, help="where to write the config")
    args = ap.parse_args()

    val, y_val = component_scores("val", args.eval_per_class)
    test, y_test = component_scores("test", args.eval_per_class)
    has_nn = "nn" in val and not args.exclude_nn
    has_ft = "ft" in val

    if args.tune_on == "val":
        tune, y_tune, report, y_report, report_name = val, y_val, test, y_test, "test_heldout_domains"
    else:
        dom = test_sources(args.eval_per_class, len(y_test))
        tune, y_tune = subset(test, dom == "wiki_csai"), y_test[dom == "wiki_csai"]
        report, y_report = subset(test, dom == "medicine"), y_test[dom == "medicine"]
        report_name = "test_medicine"
        print(f"\nTuning on HC3 wiki_csai ({len(y_tune)} chunks), reporting on HC3 medicine ({len(y_report)} chunks)")

    print("\nIndividual components (threshold 0.5):")
    individual = {}
    for k in val:
        individual[f"{k}_only"] = {"val": metrics(y_val, val[k]), "test_heldout_domains": metrics(y_test, test[k])}
        if args.tune_on != "val":
            individual[f"{k}_only"][report_name] = metrics(y_report, report[k])
        print(f"  {k:8s} val  {individual[f'{k}_only']['val']}\n"
              f"  {'':8s} test {individual[f'{k}_only']['test_heldout_domains']}")

    best = None
    grid = np.round(np.arange(0.0, 1.0 + 1e-9, STEP), 2)
    for w_r in grid:
        for w_n in (grid if has_nn else [0.0]):
            for w_f in (grid if has_ft else [0.0]):
                w_l = round(1.0 - w_r - w_n - w_f, 2)
                if w_l < -1e-9:
                    continue
                w = {"roberta": float(w_r), "lr": float(w_l), "nn": float(w_n), "ft": float(w_f)}
                f1, thr = best_threshold(y_tune, blend(tune, w))
                if best is None or f1 > best[0]:
                    best = (f1, w, thr)
    _, w, thr = best

    previous = json.loads(CONFIG_PATH.read_text()) if CONFIG_PATH.exists() else {}
    prev_w = {"roberta": previous.get("w_roberta", 0.7), "lr": previous.get("w_lr", 0.3),
              "nn": previous.get("w_nn", 0.0), "ft": previous.get("w_ft", 0.0)}
    prev_thr = previous.get("threshold", 0.55)

    tuned = {"val": metrics(y_val, blend(val, w), thr), "test_heldout_domains": metrics(y_test, blend(test, w), thr)}
    prev_on_report = metrics(y_report, blend(report, prev_w), prev_thr)
    if args.tune_on != "val":
        tuned[report_name] = metrics(y_report, blend(report, w), thr)

    before = None
    legacy_val = legacy_lr_scores("val", args.eval_per_class) if args.tune_on == "val" else None
    if legacy_val is not None:
        legacy_test = legacy_lr_scores("test", args.eval_per_class)
        old = lambda s, legacy: prev_w["roberta"] * s["roberta"] + prev_w["lr"] * legacy
        before = {"val": metrics(y_val, old(val, legacy_val), prev_thr),
                  "test_heldout_domains": metrics(y_test, old(test, legacy_test), prev_thr)}

    print(f"\n🏆 Tuned on {args.tune_on}: roberta={w['roberta']:.2f} lr={w['lr']:.2f} nn={w['nn']:.2f} "
          f"ft={w['ft']:.2f} threshold={thr:.2f}")
    if before:
        print(f"   previous system (lr_model.pkl + old weights)  test {before['test_heldout_domains']}")
    print(f"   previous weights   {report_name} {prev_on_report}")
    print(f"   tuned system       {report_name} {tuned.get(report_name, tuned['test_heldout_domains'])}")

    out = {
        "w_roberta": w["roberta"],
        "w_lr": w["lr"],
        "w_nn": w["nn"],
        "w_ft": w["ft"],
        "threshold": thr,
        "eval_samples": int(len(y_val) + len(y_test)),
        "eval": ("HC3 serving-style chunks; tuned on val split, test = held-out domains (medicine, wiki_csai)"
                 if args.tune_on == "val" else
                 "HC3 serving-style chunks; weights + threshold tuned on held-out domain wiki_csai, "
                 "reported on held-out domain medicine. Caveat: the stock Hello-SimpleAI RoBERTa "
                 "checkpoint was itself trained on all of HC3, so its scores on both are optimistic."),
        "tuned_on": args.tune_on,
        "individual": individual,
        "ensemble_tuned": tuned,
        "previous_weights_on_report_set": {"weights": prev_w, "threshold": prev_thr, report_name: prev_on_report},
        "previous_system_on_same_eval": before,
    }
    args.out.write_text(json.dumps(out, indent=2))
    print(f"💾 {args.out}")


if __name__ == "__main__":
    main()
