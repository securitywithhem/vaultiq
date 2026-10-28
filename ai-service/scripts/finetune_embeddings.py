"""
Fine-tune the sentence-embedding model (all-MiniLM-L6-v2) so human and AI-written
sentences separate in embedding space (BatchHardTripletLoss, cosine distance).

The checkpoint is saved to models/embedding_model/ (picked up automatically by
core/detector.py) ONLY if it beats the base model on the validation split, measured as
the ROC-AUC of a logistic-regression probe on chunk embeddings.

After it is saved, re-run retrain_with_enhanced_features.py (embedding features change)
and then train_neural_head.py.

Usage:
    cd ai-service
    python scripts/finetune_embeddings.py [--epochs 1] [--batch-size 32] [--max-sentences 60000]
"""

import argparse
import random
import shutil
import sys
import tempfile
from pathlib import Path

import torch
from sentence_transformers import InputExample, SentenceTransformer, losses
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from torch.utils.data import DataLoader

sys.path.insert(0, str(Path(__file__).resolve().parent))
from training_data import AI_SERVICE, SEED, load_chunks  # noqa: E402

BASE_MODEL = "all-MiniLM-L6-v2"
OUT_DIR = AI_SERVICE / "models" / "embedding_model"


def sentences_of(text: str) -> list[str]:
    """Same sentence split as detector._encode_sentences."""
    return [s.strip() for s in text.replace("?", ".").replace("!", ".").split(".") if len(s.strip()) > 20]


def probe_auc(model: SentenceTransformer, train_rows: list[dict], val_rows: list[dict]) -> float:
    enc = lambda rows: model.encode([r["text"] for r in rows], batch_size=32, convert_to_numpy=True)
    probe = LogisticRegression(max_iter=2000).fit(enc(train_rows), [r["label"] for r in train_rows])
    auc = float(roc_auc_score([r["label"] for r in val_rows], probe.predict_proba(enc(val_rows))[:, 1]))
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()  # unified memory: release encode buffers before training
    return auc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--max-sentences", type=int, default=60000)
    ap.add_argument("--chunks-per-class", type=int, default=8000)
    ap.add_argument("--margin", type=float, default=0.25)
    args = ap.parse_args()

    random.seed(SEED)
    torch.manual_seed(SEED)
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"

    train_rows = load_chunks("train", args.chunks_per_class)
    val_rows = load_chunks("val", 1500)
    probe_rows = random.sample(train_rows, min(4000, len(train_rows)))

    examples = [InputExample(texts=[s], label=r["label"]) for r in train_rows for s in sentences_of(r["text"])]
    random.shuffle(examples)
    examples = examples[: args.max_sentences]
    print(f"🔤 {len(examples):,} training sentences on {device}")

    model = SentenceTransformer(BASE_MODEL, device=device)
    base_auc = probe_auc(model, probe_rows, val_rows)
    print(f"📏 base model val probe AUC: {base_auc:.4f}")

    loader = DataLoader(examples, shuffle=True, batch_size=args.batch_size, drop_last=True)
    loss = losses.BatchHardTripletLoss(
        model,
        distance_metric=losses.BatchHardTripletLossDistanceFunction.cosine_distance,
        margin=args.margin,
    )
    model.fit(
        train_objectives=[(loader, loss)],
        epochs=args.epochs,
        warmup_steps=int(0.1 * len(loader) * args.epochs),
        show_progress_bar=True,
    )

    tuned_auc = probe_auc(model, probe_rows, val_rows)
    print(f"📏 fine-tuned val probe AUC: {tuned_auc:.4f}  (base {base_auc:.4f})")

    if tuned_auc <= base_auc:
        print("✗ No improvement — keeping the base model; nothing saved.")
        return

    with tempfile.TemporaryDirectory() as tmp:
        model.save(tmp)
        if OUT_DIR.exists():
            shutil.rmtree(OUT_DIR)
        shutil.copytree(tmp, OUT_DIR)
    print(f"💾 {OUT_DIR}\n→ next: retrain_with_enhanced_features.py, then train_neural_head.py")


if __name__ == "__main__":
    main()
