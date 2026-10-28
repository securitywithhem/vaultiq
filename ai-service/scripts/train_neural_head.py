"""
Train the neural classifier head (core/neural_head.py) on
[chunk embedding ‖ standardized 25-feature vector] → P(AI).

Trains on the train split, early-stops on val ROC-AUC, reports on the held-out domains.
Writes models/neural_head.pt + models/neural_head_meta.json; the detector only blends it
in once optimize_ensemble.py assigns it a non-zero w_nn.

Usage:
    cd ai-service
    python scripts/train_neural_head.py [--epochs 60] [--patience 6]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import roc_auc_score
from torch import nn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from training_data import AI_SERVICE, SEED, load_features, metrics  # noqa: E402

from core.neural_head import NeuralHead, NeuralScorer  # noqa: E402

MODELS = AI_SERVICE / "models"
HIDDEN = (128, 32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-per-class", type=int, default=12000)
    ap.add_argument("--eval-per-class", type=int, default=1500)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--patience", type=int, default=6)
    ap.add_argument("--batch-size", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-3)
    args = ap.parse_args()

    torch.manual_seed(SEED)
    np.random.seed(SEED)

    tr = load_features("train", args.max_per_class)
    va = load_features("val", args.eval_per_class)
    te = load_features("test", args.eval_per_class)

    feat_mean = tr["X"].mean(axis=0)
    feat_std = np.maximum(tr["X"].std(axis=0), 1e-6)
    emb_dim = tr["E"].shape[1]

    model = NeuralHead(emb_dim + tr["X"].shape[1], HIDDEN)
    scorer = NeuralScorer(model, emb_dim, feat_mean, feat_std, HIDDEN)
    x_tr = torch.from_numpy(scorer.inputs(tr["E"], tr["X"]))
    y_tr = torch.from_numpy(tr["y"].astype(np.float32))

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    loss_fn = nn.BCEWithLogitsLoss()

    best_auc, best_state, stale = -1.0, None, 0
    for epoch in range(1, args.epochs + 1):
        model.train()
        perm = torch.randperm(len(y_tr))
        total = 0.0
        for i in range(0, len(perm), args.batch_size):
            idx = perm[i : i + args.batch_size]
            if len(idx) < 2:
                continue
            opt.zero_grad()
            loss = loss_fn(model(x_tr[idx]), y_tr[idx])
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)

        model.eval()
        val_auc = roc_auc_score(va["y"], scorer.predict_proba(va["E"], va["X"]))
        print(f"epoch {epoch:3d}  loss={total / len(y_tr):.4f}  val_auc={val_auc:.4f}")
        if val_auc > best_auc:
            best_auc, stale = val_auc, 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            stale += 1
            if stale >= args.patience:
                print(f"⏹  early stop (best val AUC {best_auc:.4f})")
                break

    model.load_state_dict(best_state)
    model.eval()
    results = {
        "val": metrics(va["y"], scorer.predict_proba(va["E"], va["X"])),
        "test_heldout_domains": metrics(te["y"], scorer.predict_proba(te["E"], te["X"])),
    }
    print(f"\n📊 val  {results['val']}\n📊 test {results['test_heldout_domains']}")

    scorer.save(MODELS / "neural_head.pt", MODELS / "neural_head_meta.json")
    with open(MODELS / "training_metrics_neural_head.json", "w") as f:
        json.dump({"hidden": HIDDEN, "emb_dim": emb_dim, "n_features": int(tr["X"].shape[1]),
                   "n_train": int(len(tr["y"])), "results": results}, f, indent=2)
    print(f"💾 {MODELS / 'neural_head.pt'}\n→ next: optimize_ensemble.py")


if __name__ == "__main__":
    main()
