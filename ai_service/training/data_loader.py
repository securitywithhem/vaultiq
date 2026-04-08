"""
training/data_loader.py — Dataset loading and preparation pipeline.

Loads three HuggingFace datasets, merges them, deduplicates on SHA-256,
balances classes, and saves stratified train/val/test splits as Parquet.

Datasets used:
  - liamdugan/raid            (AI vs human text — primary)
  - artem9k/ai-text-detection-pile  (AI-generated pile)
  - jpwahle/machine-paraphrase-dataset  (paraphrased text — plagiarism proxy)

Output files (Parquet):
  data/processed/train.parquet
  data/processed/val.parquet
  data/processed/test.parquet

Label schema: 0 = human, 1 = ai_generated
"""

from __future__ import annotations

import hashlib
import logging
import sys
from pathlib import Path
from typing import Optional

import pandas as pd
from datasets import DatasetDict, concatenate_datasets, load_dataset

# Add project root to path so config is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    PROCESSED_DIR,
    RANDOM_SEED,
    TEST_SPLIT,
    TRAIN_SPLIT,
    VAL_SPLIT,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def _to_dataframe(texts: list[str], labels: list[int]) -> pd.DataFrame:
    df = pd.DataFrame({"text": texts, "label": labels})
    df["hash"] = df["text"].map(_sha256)
    return df


# ─── Dataset Loaders ──────────────────────────────────────────────────────────

def _load_raid(max_samples: int = 30000) -> pd.DataFrame:
    """
    Load the RAID dataset (liamdugan/raid).

    Expected columns: 'generation' (text), 'label' / 'model' indicating source.
    Label mapping: human rows → 0, generated rows → 1.

    Args:
        max_samples: Maximum samples to load (default 30000 for ~3GB)
    """
    log.info("Loading RAID dataset (max %d samples) …", max_samples)
    try:
        ds = load_dataset("liamdugan/raid", split="train", trust_remote_code=True)
        df = ds.to_pandas()
        if len(df) > max_samples:
            df = df.sample(max_samples, random_state=42)
            log.info("  Sampled down to %d rows", max_samples)

        # Determine text column
        text_col = "generation" if "generation" in df.columns else df.columns[0]

        # Determine label column (model == "human" → 0, else → 1)
        if "model" in df.columns:
            df["label"] = (df["model"] != "human").astype(int)
        elif "label" in df.columns:
            df["label"] = df["label"].astype(int)
        else:
            # Default: treat everything as AI-generated (conservative)
            df["label"] = 1

        df = df.rename(columns={text_col: "text"})[["text", "label"]].dropna()
        df["text"] = df["text"].astype(str)
        log.info("RAID: %d rows loaded", len(df))
        return df
    except Exception as exc:
        log.warning("Failed to load RAID: %s — skipping", exc)
        return pd.DataFrame(columns=["text", "label"])


def _load_ai_pile(max_samples: int = 15000) -> pd.DataFrame:
    """
    Load the AI text detection pile (artem9k/ai-text-detection-pile).

    Label mapping: 'Human' → 0, any AI → 1.

    Args:
        max_samples: Maximum samples to load (default 15000 for ~1.5GB)
    """
    log.info("Loading AI-text-detection-pile (max %d samples) …", max_samples)
    try:
        ds = load_dataset(
            "artem9k/ai-text-detection-pile", split="train", trust_remote_code=True
        )
        df = ds.to_pandas()
        if len(df) > max_samples:
            df = df.sample(max_samples, random_state=42)
            log.info("  Sampled down to %d rows", max_samples)

        text_col = next(
            (c for c in ("text", "content", "document") if c in df.columns),
            df.columns[0],
        )
        label_col = next(
            (c for c in ("label", "source", "class") if c in df.columns),
            None,
        )

        df = df.rename(columns={text_col: "text"}).dropna(subset=[text_col])
        df["text"] = df["text"].astype(str)

        if label_col:
            df["label"] = df[label_col].apply(
                lambda x: 0 if str(x).lower() in ("human", "0", "real") else 1
            )
        else:
            df["label"] = 1  # assume AI if no label column

        df = df[["text", "label"]]
        log.info("AI pile: %d rows loaded", len(df))
        return df
    except Exception as exc:
        log.warning("Failed to load AI pile: %s — skipping", exc)
        return pd.DataFrame(columns=["text", "label"])


def _load_paraphrase(max_samples: int = 10000) -> pd.DataFrame:
    """
    Load machine-paraphrase-dataset (jpwahle/machine-paraphrase-dataset).

    Paraphrased (machine-generated) text → label 1.
    Original human text → label 0.

    Args:
        max_samples: Maximum samples to load (default 10000 for ~1GB)
    """
    log.info("Loading machine-paraphrase-dataset (max %d samples) …", max_samples)
    try:
        ds = load_dataset(
            "jpwahle/machine-paraphrase-dataset", split="train", trust_remote_code=True
        )
        df = ds.to_pandas()
        if len(df) > max_samples:
            df = df.sample(max_samples, random_state=42)
            log.info("  Sampled down to %d rows", max_samples)

        text_col = next(
            (c for c in ("text", "paraphrase", "sentence") if c in df.columns),
            df.columns[0],
        )
        df = df.rename(columns={text_col: "text"}).dropna(subset=[text_col])
        df["text"] = df["text"].astype(str)

        # If original + paraphrase columns present, stack them
        if "original" in df.columns and "paraphrase" in df.columns:
            originals = pd.DataFrame({"text": df["original"], "label": 0})
            paraphrases = pd.DataFrame({"text": df["paraphrase"], "label": 1})
            df = pd.concat([originals, paraphrases], ignore_index=True)
        elif "label" in df.columns:
            df["label"] = df["label"].astype(int)
        else:
            df["label"] = 1

        df = df[["text", "label"]].dropna()
        log.info("Paraphrase: %d rows loaded", len(df))
        return df
    except Exception as exc:
        log.warning("Failed to load paraphrase dataset: %s — skipping", exc)
        return pd.DataFrame(columns=["text", "label"])


# ─── Main Pipeline ────────────────────────────────────────────────────────────

def build_dataset(
    max_per_class: Optional[int] = None,
    save: bool = True,
    raid_max: int = 30000,
    ai_pile_max: int = 15000,
    paraphrase_max: int = 10000,
) -> dict[str, pd.DataFrame]:
    """
    Full dataset preparation pipeline.

    Steps:
      1. Load all three datasets (with optional size limits).
      2. Concatenate and deduplicate on SHA-256 hash.
      3. Balance classes (undersample majority).
      4. Stratified split: 70% train / 15% val / 15% test.
      5. Save splits to data/processed/ as Parquet (if save=True).

    Args:
        max_per_class:   Optional cap on samples per class before splitting.
        save:            Whether to write Parquet files to disk.
        raid_max:        Max samples from RAID dataset (default 30000 for ~3GB)
        ai_pile_max:     Max samples from AI pile (default 15000 for ~1.5GB)
        paraphrase_max:  Max samples from paraphrase (default 10000 for ~1GB)
                         Total ~5.5GB

    Returns:
        dict with keys "train", "val", "test" mapping to DataFrames.

    Example for 5GB dataset:
        build_dataset(raid_max=20000, ai_pile_max=12000, paraphrase_max=8000)
    """
    frames = []
    for loader, max_samples in [
        (_load_raid, raid_max),
        (_load_ai_pile, ai_pile_max),
        (_load_paraphrase, paraphrase_max),
    ]:
        df = loader(max_samples)
        if not df.empty:
            frames.append(df)

    if not frames:
        raise RuntimeError("All dataset loaders failed — cannot build dataset.")

    combined = pd.concat(frames, ignore_index=True)
    log.info("Combined (pre-dedup): %d rows", len(combined))

    # ── Deduplication ──────────────────────────────────────────────────────────
    combined["hash"] = combined["text"].map(_sha256)
    combined = combined.drop_duplicates(subset="hash").drop(columns="hash")
    log.info("After dedup: %d rows", len(combined))

    # ── Class balancing ────────────────────────────────────────────────────────
    class_0 = combined[combined["label"] == 0]
    class_1 = combined[combined["label"] == 1]
    min_count = min(len(class_0), len(class_1))
    if max_per_class:
        min_count = min(min_count, max_per_class)

    class_0 = class_0.sample(min_count, random_state=RANDOM_SEED)
    class_1 = class_1.sample(min_count, random_state=RANDOM_SEED)
    balanced = pd.concat([class_0, class_1]).sample(frac=1, random_state=RANDOM_SEED)
    log.info("Balanced: %d per class, total %d", min_count, len(balanced))

    # ── Stratified split ───────────────────────────────────────────────────────
    from sklearn.model_selection import train_test_split

    train_df, temp_df = train_test_split(
        balanced,
        test_size=(1.0 - TRAIN_SPLIT),
        stratify=balanced["label"],
        random_state=RANDOM_SEED,
    )
    relative_val = VAL_SPLIT / (VAL_SPLIT + TEST_SPLIT)
    val_df, test_df = train_test_split(
        temp_df,
        test_size=(1.0 - relative_val),
        stratify=temp_df["label"],
        random_state=RANDOM_SEED,
    )

    log.info(
        "Split sizes — train: %d | val: %d | test: %d",
        len(train_df), len(val_df), len(test_df),
    )

    splits = {"train": train_df, "val": val_df, "test": test_df}

    # ── Persist ────────────────────────────────────────────────────────────────
    if save:
        out_dir = Path(PROCESSED_DIR)
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, df in splits.items():
            out_path = out_dir / f"{name}.parquet"
            df.to_parquet(str(out_path), index=False)
            log.info("Saved %s → %s", name, out_path)

    return splits


if __name__ == "__main__":
    # Run with default sizes (~5.5 GB total)
    # build_dataset()

    # Run with smaller dataset (~5 GB total)
    # - RAID: 20K samples (~2.5GB)
    # - AI Pile: 12K samples (~1.2GB)
    # - Paraphrase: 8K samples (~1GB)
    # - Total: ~4.7 GB
    build_dataset(
        raid_max=20000,
        ai_pile_max=12000,
        paraphrase_max=8000,
    )

    # Run with minimal dataset (~2 GB total) - for testing
    # build_dataset(raid_max=5000, ai_pile_max=5000, paraphrase_max=5000)
