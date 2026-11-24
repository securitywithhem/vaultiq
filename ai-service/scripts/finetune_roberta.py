"""
Fine-tune RoBERTa (roberta-base) as a human-vs-AI sequence classifier on HC3 plus
formal-text corpora (training_data.EXTRA_SOURCES).

Why the extra corpora: trained on HC3 alone, the model learned "formal writing = AI"
(HC3's human answers are casual Reddit / Q&A) and scored a human-written essay 0.96 AI.
GPT-wiki-intro and the detection pile add formal human text, and paired formal AI text.

Why roberta-base and not the served Hello-SimpleAI/chatgpt-detector-roberta:
that checkpoint was already trained on all of HC3 — including the medicine and
wiki_csai domains we hold out as the test set — so fine-tuning it again would teach
it little and its test score is not a true out-of-domain number. Starting from the
generic language model gives a detector trained only on our train split, so the
held-out-domain test result is honest.

Data: serving-style chunks (HC3 split by domain; extra sources 80/10/10 by hash).
Training: plain PyTorch loop — AdamW, linear warmup + decay, gradient clipping, gradient
accumulation; evaluated on val log loss several times per epoch, best checkpoint kept,
early stopping on patience. Final report: HC3 val, HC3 held-out test (per domain) and
each extra source's test split.

Output: models/roberta_finetuned/ (HF save_pretrained) +
        models/training_metrics_roberta_finetuned.json
core/detector.py loads it automatically; optimize_ensemble.py assigns its weight (w_ft).

Usage:
    cd ai-service
    .venv/bin/python scripts/finetune_roberta.py [--epochs 2] [--max-per-class 12000]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

# Apple-silicon GPU: cap MPS memory so an oversized run errors out instead of driving the
# machine into swap (must be set before torch initialises MPS).
os.environ.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", "0.6")
os.environ.setdefault("PYTORCH_MPS_LOW_WATERMARK_RATIO", "0.5")  # must be <= high (default 1.4)

import numpy as np
import torch
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sklearn.metrics import log_loss  # noqa: E402
from training_data import (  # noqa: E402
    AI_SERVICE, EXTRA_SOURCES, SEED, load_chunks, load_extra_chunks, metrics,
)

BASE_MODEL = "roberta-base"
OUT_DIR = AI_SERVICE / "models" / "roberta_finetuned"
METRICS_PATH = AI_SERVICE / "models" / "training_metrics_roberta_finetuned.json"


def pick_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def make_loader(rows: list[dict], tokenizer, max_len: int, batch_size: int, shuffle: bool) -> DataLoader:
    def collate(batch):
        # Fixed-length padding: every batch has the same shape, so MPS compiles its kernels
        # once instead of caching a new graph per sequence length (which exhausts memory).
        enc = tokenizer([r["text"] for r in batch], truncation=True, max_length=max_len,
                        padding="max_length", return_tensors="pt")
        enc["labels"] = torch.tensor([r["label"] for r in batch], dtype=torch.long)
        return enc

    g = torch.Generator().manual_seed(SEED)
    return DataLoader(rows, batch_size=batch_size, shuffle=shuffle, collate_fn=collate, generator=g)


@torch.no_grad()
def predict(model, loader: DataLoader, device: torch.device) -> np.ndarray:
    """P(AI) for every row in loader order."""
    model.eval()
    out = []
    for batch in loader:
        batch = {k: v.to(device) for k, v in batch.items() if k != "labels"}
        logits = model(**batch).logits
        out.append(torch.softmax(logits.float(), dim=-1)[:, 1].cpu().numpy())
    return np.concatenate(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-model", default=BASE_MODEL)
    ap.add_argument("--max-per-class", type=int, default=7000, help="HC3 train chunks per class")
    ap.add_argument("--extra-sources", nargs="*", default=list(EXTRA_SOURCES), choices=EXTRA_SOURCES,
                    help="formal-text corpora mixed into training (none = HC3 only)")
    ap.add_argument("--extra-per-class", type=int, default=3500, help="train chunks per class per extra source")
    ap.add_argument("--extra-val-per-class", type=int, default=500, help="val/test chunks per class per extra source")
    ap.add_argument("--select-val-per-class", type=int, default=1000, help="HC3 val chunks used for checkpoint selection")
    ap.add_argument("--eval-per-class", type=int, default=1500, help="HC3 val/test chunks in the final report")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--batch-size", type=int, default=8, help="micro-batch per forward pass")
    ap.add_argument("--grad-accum", type=int, default=2, help="micro-batches per optimizer step")
    ap.add_argument("--grad-checkpointing", action="store_true",
                    help="trade ~30%% speed for much lower activation memory")
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--weight-decay", type=float, default=0.01)
    ap.add_argument("--warmup-ratio", type=float, default=0.06)
    ap.add_argument("--max-len", type=int, default=192,
                    help="chunks: p50 87 / p95 167 tokens; 192 truncates ~2.6%%. Keep in sync with detector.FT_MAX_LEN")
    ap.add_argument("--evals-per-epoch", type=int, default=4)
    ap.add_argument("--patience", type=int, default=3, help="evaluations without val log-loss improvement")
    ap.add_argument("--max-steps", type=int, default=0, help="stop after N steps (0 = no limit; for smoke tests)")
    args = ap.parse_args()

    torch.manual_seed(SEED)
    np.random.seed(SEED)
    device = pick_device()

    print("📚 Loading training data")
    train_rows = load_chunks("train", args.max_per_class)
    val_rows = load_chunks("val", args.select_val_per_class)  # checkpoint selection set
    for src in args.extra_sources:
        train_rows += load_extra_chunks(src, "train", args.extra_per_class)
        val_rows += load_extra_chunks(src, "val", args.extra_val_per_class)
    y_val = np.array([r["label"] for r in val_rows])
    print(f"   → {len(train_rows):,} train chunks, {len(val_rows):,} selection-val chunks")

    print("📚 Loading report sets")
    report_sets = {
        "hc3_val": load_chunks("val", args.eval_per_class),
        "hc3_test": load_chunks("test", args.eval_per_class),  # held-out domains: medicine + wiki_csai
    }
    for src in args.extra_sources:
        report_sets[f"{src}_test"] = load_extra_chunks(src, "test", args.extra_val_per_class)

    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base_model, num_labels=2, id2label={0: "Human", 1: "ChatGPT"}, label2id={"Human": 0, "ChatGPT": 1},
    ).to(device)

    train_loader = make_loader(train_rows, tokenizer, args.max_len, args.batch_size, shuffle=True)
    val_loader = make_loader(val_rows, tokenizer, args.max_len, 32, shuffle=False)

    no_decay = ("bias", "LayerNorm.weight")
    params = [
        {"params": [p for n, p in model.named_parameters() if not any(nd in n for nd in no_decay)],
         "weight_decay": args.weight_decay},
        {"params": [p for n, p in model.named_parameters() if any(nd in n for nd in no_decay)],
         "weight_decay": 0.0},
    ]
    optimizer = torch.optim.AdamW(params, lr=args.lr)
    if args.grad_checkpointing:
        model.gradient_checkpointing_enable()
    steps_per_epoch = math.ceil(len(train_loader) / args.grad_accum)
    total_steps = steps_per_epoch * args.epochs
    if args.max_steps:
        total_steps = min(total_steps, args.max_steps)
    scheduler = get_linear_schedule_with_warmup(optimizer, int(args.warmup_ratio * total_steps), total_steps)
    eval_every = max(1, math.ceil(steps_per_epoch / args.evals_per_epoch))

    print(f"🧠 {args.base_model} on {device} · {len(train_rows):,} train chunks · "
          f"batch {args.batch_size}×{args.grad_accum} · {total_steps:,} steps · eval every {eval_every} steps"
          f"{' · grad checkpointing' if args.grad_checkpointing else ''}")

    history, best_loss, best_state, best_step, stale, step = [], float("inf"), None, 0, 0, 0
    t0 = time.time()
    stop = False
    for epoch in range(1, args.epochs + 1):
        running = 0.0
        micro = 0
        for batch in train_loader:
            model.train()
            batch = {k: v.to(device) for k, v in batch.items()}
            loss = model(**batch).loss  # cross-entropy over {human, AI}
            (loss / args.grad_accum).backward()  # gradient accumulation: effective batch = batch × accum
            running += loss.item() / args.grad_accum
            micro += 1
            if micro % args.grad_accum and micro < len(train_loader):
                continue
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad(set_to_none=True)
            step += 1

            if step % 25 == 0:
                print(f"  epoch {epoch} step {step:5d}/{total_steps}  loss={running / 25:.4f}  "
                      f"lr={scheduler.get_last_lr()[0]:.2e}  {time.time() - t0:.0f}s", flush=True)
                running = 0.0

            last = step >= total_steps
            if step % eval_every == 0 or last:
                p_val = predict(model, val_loader, device)
                val_m = {**metrics(y_val, p_val), "log_loss": round(float(log_loss(y_val, p_val, labels=[0, 1])), 4)}
                history.append({"step": step, "epoch": epoch, **{f"val_{k}": v for k, v in val_m.items()}})
                print(f"  ✔ eval @ step {step}: val {val_m}", flush=True)
                # Select on log loss: AUC saturates at 1.0 in-domain and stops discriminating checkpoints.
                if val_m["log_loss"] < best_loss:
                    best_loss, stale = val_m["log_loss"], 0
                    best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
                    best_step = step
                else:
                    stale += 1
                    if stale >= args.patience:
                        print(f"⏹  early stop (best val log loss {best_loss:.4f} @ step {best_step})")
                        stop = True
                if device.type == "mps":
                    torch.mps.empty_cache()
            if stop or last:
                stop = True
                break
        if stop:
            break

    model.load_state_dict(best_state)
    results = {}
    for name, rows in report_sets.items():
        probs = predict(model, make_loader(rows, tokenizer, args.max_len, 32, shuffle=False), device)
        y = np.array([r["label"] for r in rows])
        results[name] = metrics(y, probs)
        print(f"📊 {name:16s} {results[name]}")
        if name == "hc3_test":  # break the held-out domains apart
            src = np.array([r["source"] for r in rows])
            for dom in sorted(set(src)):
                m = src == dom
                key = "hc3_test_" + dom.removeprefix("hc3_")
                results[key] = metrics(y[m], probs[m])
                print(f"📊   {key:14s} {results[key]}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model.to("cpu").save_pretrained(OUT_DIR)
    tokenizer.save_pretrained(OUT_DIR)
    METRICS_PATH.write_text(json.dumps({
        "base_model": args.base_model,
        "data": ("serving-style chunks: HC3 train split (test domains medicine + wiki_csai never seen) + "
                 f"extra formal-text sources {args.extra_sources} (80/10/10 hash split)"),
        "n_train": len(train_rows),
        "hyperparameters": {k: v for k, v in vars(args).items() if k != "base_model"},
        "steps_trained": step,
        "train_seconds": round(time.time() - t0),
        "selection": "lowest val log loss",
        "best_step": best_step,
        "best_val_log_loss": best_loss,
        "results": results,
        "history": history,
    }, indent=2))
    print(f"💾 {OUT_DIR}\n→ next: optimize_ensemble.py")


if __name__ == "__main__":
    main()
