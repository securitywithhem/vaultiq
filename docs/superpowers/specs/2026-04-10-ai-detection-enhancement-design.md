---
title: AI Detection Enhancement Design
date: 2026-04-10
status: approved
---

# AI Detection Enhancement — `ai-service/`

## Context

VaultIQ already has a working AI detection microservice in `ai-service/` (FastAPI, uvicorn).
The service exposes `POST /detect` and `POST /detect/text`, uses `roberta-base-openai-detector`
for semantic scoring and a GPT-2 perplexity proxy for statistical features, with a Logistic
Regression ensemble (currently running in DummyLR mode because no trained `lr_model.pkl` exists).

This design adds the missing training infrastructure and refactors the statistical/ensemble logic
into dedicated modules — without touching the working routes or tests.

---

## Scope

### What is added
| File | Purpose |
|------|---------|
| `ai-service/statistical.py` | 8-feature extractor (moved + 3 new features) |
| `ai-service/ensemble.py` | `train_lr()` + `aggregate()` |
| `ai-service/training/download_datasets.py` | Downloads 3 HuggingFace datasets → `train.csv` / `test.csv` |
| `ai-service/training/setup_detection.py` | One-shot training orchestrator (4 steps) |

### What is NOT changed
- `main.py` — routes, middleware, startup event
- `extractor.py` — extraction logic
- `preprocessor.py` — spaCy chunker
- `tests/` — all existing tests must keep passing
- `models/roberta/` — no fine-tuning; `roberta-base-openai-detector` is kept as-is

### One targeted edit
`detector.py` gets two internal call-site updates:
1. `extract_features()` body replaced with a delegation to `statistical.extract_features()`
2. `ensemble_score()` body replaced with a delegation to `ensemble.aggregate()`

Public function signatures, return types, and behavior are unchanged.

---

## Architecture

```
POST /detect  or  POST /detect/text
      │
      ▼
main.py  →  extractor.extract_text()  →  preprocessor.preprocess()
                                               │
                              ┌────────────────┴────────────────┐
                              ▼                                  ▼
                    detector.roberta_score()          statistical.extract_features()
                    (roberta-base-openai-detector)    (8 features, GPT-2 singleton)
                              │                                  │
                              └────────────────┬────────────────┘
                                               ▼
                                     ensemble.aggregate()
                                     (0.7 * roberta + 0.3 * lr)
                                               │
                                               ▼
                                     JSON response (unchanged shape)
```

---

## Training Flow

```
python training/setup_detection.py
  Step 1/3  download_datasets.py logic
            → checks training/datasets/train.csv; skips if exists
            → downloads: NicolaiSivesind/m4, aadityaubhat/GPT-wiki-intro,
                         Hello-SimpleAI/HC3
            → unified schema: [text, label]  (0=human, 1=ai)
            → shuffle, 80/20 split
            → saves training/datasets/train.csv + test.csv

  Step 2/3  Statistical feature extraction
            → loads train.csv
            → runs statistical.extract_features() on each text row
            → checks training/outputs/lr_features.npz; skips if exists
            → saves training/outputs/lr_features.npz

  Step 3/3  Logistic Regression training
            → checks models/lr_model.pkl; skips if real model already present
            → trains sklearn LogisticRegression on lr_features.npz
            → saves models/lr_model.pkl  (overwrites DummyLR)
            → prints train/test accuracy

  Done → restart server; detector.py loads real lr_model.pkl on startup
```

---

## `statistical.py` — 8 Features

| Index | Feature | Method |
|-------|---------|--------|
| 0 | perplexity | GPT-2 cross-entropy loss (module-level singleton) |
| 1 | burstiness | `std(sentence_lengths) / mean(sentence_lengths)` |
| 2 | type_token_ratio | `unique_words / total_words` |
| 3 | avg_sentence_length | `mean(words_per_sentence)` |
| 4 | punctuation_ratio | `punct_chars / total_chars` |
| 5 | unique_bigram_ratio | `unique_bigrams / total_bigrams` |
| 6 | gunning_fog_index | `textstat.gunning_fog(text)` |
| 7 | stopword_ratio | `nltk_stopwords ∩ words / total_words` |

Input: `List[str]` (chunks from preprocessor)
Output: `np.ndarray` of shape `(n_chunks, 8)`

GPT-2 tokenizer + model loaded once at module level on first call (lazy singleton).

---

## `ensemble.py`

```python
def train_lr(features: np.ndarray, labels: List[int]) -> None:
    """Train LogisticRegression and save to models/lr_model.pkl."""

def aggregate(roberta_score: float, lr_score: float) -> dict:
    """Weighted average: 0.7 * roberta + 0.3 * lr.
    
    Returns:
        {
          "ai_probability": float,
          "label": "ai" | "human",
          "roberta_score": float,
          "lr_score": float,
          "confidence": float
        }
    """
```

`train_lr` is called only by `setup_detection.py`.
`aggregate` is called per-chunk by `detector.ensemble_score()`.

---

## `training/download_datasets.py`

- Uses HuggingFace `datasets` library
- Idempotent: checks `training/datasets/train.csv` before downloading
- Datasets:
  - `NicolaiSivesind/m4` — multi-domain AI vs human
  - `aadityaubhat/GPT-wiki-intro` — Wikipedia-style GPT text
  - `Hello-SimpleAI/HC3` — human vs ChatGPT QA
- Unified schema: `text` (str), `label` (int: 0=human, 1=ai)
- Progress via `tqdm`
- Output: `training/datasets/train.csv`, `training/datasets/test.csv`

---

## Packages to add to `requirements.txt`

```
textstat>=0.7
nltk>=3.8
pandas>=2.0
tqdm>=4.66
datasets>=2.18
```

---

## Constraints

- **Never delete or overwrite** any existing file except `detector.py` (one targeted edit)
- **Never change** routes, middleware, database schema, or environment variables
- `models/lr_model.pkl` is overwritten only by `setup_detection.py` (intentional)
- All heavy models (GPT-2 in statistical.py) use lazy loading — load on first call, not at import
- All new functions have docstrings
- Existing tests in `tests/test_detector.py` and `tests/test_extractor.py` must pass unchanged

---

## Verification Steps

1. `python -c "import statistical; import ensemble; print('Import OK')"`
2. `python training/setup_detection.py` — watch all 3 steps complete
3. `uvicorn main:app --reload --port 8000` — server starts without errors
4. `curl -X POST http://localhost:8000/detect -F "file=@dummy_test_doc.txt"` — valid JSON response
5. `pytest tests/` — all previously passing tests still pass
