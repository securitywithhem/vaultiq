# AI Detection Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `statistical.py`, `ensemble.py`, `training/download_datasets.py`, and `training/setup_detection.py` to `ai-service/` so the LR model can be trained on real data instead of running as a DummyLR.

**Architecture:** `statistical.py` owns a lazy GPT-2 singleton and produces an `(n_chunks, 8)` feature matrix. `ensemble.py` owns `train_lr()` and `aggregate()`. `detector.py` gets two internal call-site updates to delegate to these modules — its public API and all existing tests remain unbroken except `test_extract_features` which is updated from shape `(5,)` to `(8,)` to match the new contract. Training scripts live in `ai-service/training/`.

**Tech Stack:** Python 3.11, FastAPI, scikit-learn, HuggingFace `datasets`, `textstat`, `nltk`, `pandas`, `tqdm`, `torch`, `transformers`

**Run all tests from:** `ai-service/` directory  
**Run server from:** `ai-service/` with `uvicorn main:app --reload --port 8000`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `ai-service/requirements.txt` | Add 5 missing packages |
| Create | `ai-service/statistical.py` | GPT-2 singleton + 8-feature extraction |
| Create | `ai-service/tests/test_statistical.py` | Tests for statistical features |
| Create | `ai-service/ensemble.py` | `aggregate()` + `train_lr()` |
| Create | `ai-service/tests/test_ensemble.py` | Tests for ensemble functions |
| Modify | `ai-service/detector.py` | Delegate `extract_features` + `ensemble_score` |
| Modify | `ai-service/tests/test_detector.py` | Update shape assertion (5,)→(8,) |
| Create | `ai-service/training/download_datasets.py` | Download 3 HF datasets → train/test CSVs |
| Create | `ai-service/tests/test_download_datasets.py` | Tests for download logic |
| Create | `ai-service/training/setup_detection.py` | 3-step training orchestrator |

---

## Task 0: Add missing packages to `requirements.txt`

**Files:**
- Modify: `ai-service/requirements.txt`

- [ ] **Step 1: Append the 5 missing packages**

Open `ai-service/requirements.txt` and append at the end:

```
# AI detection training dependencies
textstat>=0.7
nltk>=3.8
pandas>=2.0
tqdm>=4.66
datasets>=2.18
```

- [ ] **Step 2: Install in the active environment**

```bash
cd ai-service
pip install textstat nltk pandas tqdm datasets
```

Expected: All packages install without errors.

- [ ] **Step 3: Verify imports work**

```bash
python -c "import textstat, nltk, pandas, tqdm, datasets; print('All imports OK')"
```

Expected: `All imports OK`

- [ ] **Step 4: Commit**

```bash
git add ai-service/requirements.txt
git commit -m "feat(ai-service): add textstat, nltk, pandas, tqdm, datasets to requirements"
```

---

## Task 1: Create `statistical.py` — 8-feature extractor

**Files:**
- Create: `ai-service/statistical.py`
- Create: `ai-service/tests/test_statistical.py`

- [ ] **Step 1: Write the failing tests**

Create `ai-service/tests/test_statistical.py`:

```python
"""
test_statistical.py — Tests for statistical feature extraction.

GPT-2 is mocked so these tests run fast without loading real model weights.
"""
from __future__ import annotations

import numpy as np
import pytest
import torch
from unittest.mock import MagicMock, patch


@pytest.fixture(autouse=True)
def mock_gpt2():
    """Patch GPT-2 globals before each test to avoid loading real weights."""
    mock_tokenizer = MagicMock()
    mock_tokenizer.return_value = {
        "input_ids": torch.ones(1, 10, dtype=torch.long)
    }
    mock_output = MagicMock()
    mock_output.loss = torch.tensor(2.0)
    mock_model = MagicMock(return_value=mock_output)

    import statistical
    with patch.object(statistical, "_gpt2_tokenizer", mock_tokenizer), \
         patch.object(statistical, "_gpt2_model", mock_model):
        yield


def test_extract_features_shape_multi():
    """extract_features returns (n_chunks, 8) for multiple chunks."""
    import statistical
    chunks = [
        "The quick brown fox jumped over the lazy dog. It was a sunny afternoon.",
        "Furthermore, it is important to note that the implications are multifaceted.",
    ]
    result = statistical.extract_features(chunks)
    assert isinstance(result, np.ndarray)
    assert result.shape == (2, 8)


def test_extract_features_shape_single():
    """extract_features returns (1, 8) for a single chunk."""
    import statistical
    result = statistical.extract_features(["Hello world. This is a test sentence."])
    assert result.shape == (1, 8)


def test_extract_features_all_finite():
    """All feature values must be finite floats."""
    import statistical
    chunks = [
        "Simple text with punctuation! Does it work? Yes, it does.",
        "Another paragraph about machine learning models and their outputs.",
    ]
    result = statistical.extract_features(chunks)
    assert np.all(np.isfinite(result)), f"Non-finite values found: {result}"


def test_extract_features_empty_text():
    """Empty-ish text produces a row of zeros without raising."""
    import statistical
    result = statistical.extract_features(["   "])
    assert result.shape == (1, 8)
    assert np.all(result == 0.0)


def test_feature_indices_stable():
    """Spot-check that feature indices 5-7 (new features) are non-negative."""
    import statistical
    text = (
        "The government announced new policies regarding environmental protection. "
        "Scientists say that climate change requires immediate action. "
        "People around the world are increasingly aware of these issues."
    )
    result = statistical.extract_features([text])
    # unique_bigram_ratio (idx 5), gunning_fog (idx 6), stopword_ratio (idx 7)
    assert result[0, 5] >= 0.0  # unique_bigram_ratio in [0, 1]
    assert result[0, 6] >= 0.0  # gunning_fog is non-negative
    assert result[0, 7] >= 0.0  # stopword_ratio in [0, 1]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ai-service
python -m pytest tests/test_statistical.py -v
```

Expected: `ModuleNotFoundError: No module named 'statistical'`

- [ ] **Step 3: Create `ai-service/statistical.py`**

```python
"""
statistical.py — Statistical text feature extractor for AI detection.

Computes 8 features per text chunk:
  0: perplexity          — GPT-2 cross-entropy proxy (lazy singleton)
  1: burstiness          — std(sentence_lengths) / mean(sentence_lengths)
  2: type_token_ratio    — unique_words / total_words
  3: avg_sentence_length — mean words per sentence
  4: punctuation_ratio   — punct_chars / total_chars
  5: unique_bigram_ratio — unique bigrams / total bigrams
  6: gunning_fog_index   — via textstat
  7: stopword_ratio      — NLTK stopwords / total words
"""
from __future__ import annotations

import logging
import string
from typing import List

import numpy as np

logger = logging.getLogger(__name__)

# ── GPT-2 lazy singleton ───────────────────────────────────────────────────
_gpt2_tokenizer = None
_gpt2_model = None


def _ensure_gpt2() -> None:
    """Load GPT-2 tokenizer and model on first use; no-op on subsequent calls."""
    global _gpt2_tokenizer, _gpt2_model
    if _gpt2_model is not None:
        return
    from transformers import GPT2LMHeadModel, GPT2TokenizerFast
    logger.info("Loading GPT-2 for perplexity computation (first use)…")
    _gpt2_tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")
    _gpt2_model = GPT2LMHeadModel.from_pretrained("gpt2")
    _gpt2_model.eval()


def _perplexity(text: str) -> float:
    """Return GPT-2 perplexity for *text*. Returns 0.0 on failure."""
    _ensure_gpt2()
    try:
        import torch
        inputs = _gpt2_tokenizer(
            text, return_tensors="pt", truncation=True, max_length=1024
        )
        with torch.no_grad():
            out = _gpt2_model(inputs["input_ids"], labels=inputs["input_ids"])
            return float(torch.exp(out.loss).item())
    except Exception as exc:
        logger.warning("Perplexity failed: %s", exc)
        return 0.0


def _split_sentences(text: str) -> List[str]:
    """Split *text* into sentences on . ! ? boundaries."""
    import re
    parts = re.split(r"[.!?]+", text)
    return [p.strip() for p in parts if p.strip()]


def _bigrams(words: List[str]) -> List[tuple]:
    """Return consecutive (word_i, word_{i+1}) pairs."""
    return [(words[i], words[i + 1]) for i in range(len(words) - 1)]


def extract_features(chunks: List[str]) -> np.ndarray:
    """Extract 8 statistical features for each text chunk.

    Args:
        chunks: List of text strings (e.g. output of preprocessor.preprocess).

    Returns:
        np.ndarray of shape (n_chunks, 8).  All values are finite floats.
        An all-zero row is returned for empty / whitespace-only chunks.
    """
    import nltk
    import textstat

    nltk.download("stopwords", quiet=True)
    from nltk.corpus import stopwords as _sw
    stop_words: set = set(_sw.words("english"))

    rows: List[List[float]] = []

    for text in chunks:
        if not text or not text.strip():
            rows.append([0.0] * 8)
            continue

        words = text.split()
        total_words = len(words)
        total_chars = len(text)
        sentences = _split_sentences(text)

        # 0 — perplexity
        perplexity = _perplexity(text)

        # 1 — burstiness
        if len(sentences) > 1:
            lens = [len(s.split()) for s in sentences]
            mean_l = float(np.mean(lens))
            burstiness = float(np.std(lens)) / mean_l if mean_l > 0 else 0.0
        else:
            burstiness = 0.0

        # 2 — type-token ratio
        ttr = (
            len({w.lower() for w in words}) / total_words if total_words else 0.0
        )

        # 3 — avg sentence length
        avg_sent_len = (
            float(np.mean([len(s.split()) for s in sentences])) if sentences else 0.0
        )

        # 4 — punctuation ratio
        punct_ratio = (
            sum(1 for c in text if c in string.punctuation) / total_chars
            if total_chars
            else 0.0
        )

        # 5 — unique bigram ratio
        bg = _bigrams(words)
        ubr = len(set(bg)) / len(bg) if bg else 0.0

        # 6 — gunning fog index
        try:
            fog = float(textstat.gunning_fog(text))
        except Exception:
            fog = 0.0

        # 7 — stopword ratio
        sw_ratio = (
            sum(1 for w in words if w.lower() in stop_words) / total_words
            if total_words
            else 0.0
        )

        rows.append([perplexity, burstiness, ttr, avg_sent_len,
                     punct_ratio, ubr, fog, sw_ratio])

    return np.array(rows, dtype=float)
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd ai-service
python -m pytest tests/test_statistical.py -v
```

Expected:
```
tests/test_statistical.py::test_extract_features_shape_multi PASSED
tests/test_statistical.py::test_extract_features_shape_single PASSED
tests/test_statistical.py::test_extract_features_all_finite PASSED
tests/test_statistical.py::test_extract_features_empty_text PASSED
tests/test_statistical.py::test_feature_indices_stable PASSED
```

- [ ] **Step 5: Commit**

```bash
git add ai-service/statistical.py ai-service/tests/test_statistical.py
git commit -m "feat(ai-service): add statistical.py with 8-feature extractor"
```

---

## Task 2: Create `ensemble.py` — aggregation and LR training

**Files:**
- Create: `ai-service/ensemble.py`
- Create: `ai-service/tests/test_ensemble.py`

- [ ] **Step 1: Write the failing tests**

Create `ai-service/tests/test_ensemble.py`:

```python
"""
test_ensemble.py — Tests for ensemble aggregation and LR training.
"""
from __future__ import annotations

import numpy as np
import pytest
from pathlib import Path
import tempfile
import joblib
from sklearn.linear_model import LogisticRegression


def test_aggregate_weighted_average():
    """ai_probability must equal 0.70*roberta + 0.30*lr."""
    import ensemble
    result = ensemble.aggregate(roberta_score=0.8, lr_score=0.6)
    expected = round(0.70 * 0.8 + 0.30 * 0.6, 4)
    assert abs(result["ai_probability"] - expected) < 1e-6


def test_aggregate_label_ai():
    """label is 'ai' when ai_probability >= 0.5."""
    import ensemble
    result = ensemble.aggregate(roberta_score=1.0, lr_score=1.0)
    assert result["label"] == "ai"


def test_aggregate_label_human():
    """label is 'human' when ai_probability < 0.5."""
    import ensemble
    result = ensemble.aggregate(roberta_score=0.0, lr_score=0.0)
    assert result["label"] == "human"


def test_aggregate_keys():
    """Return dict must contain all five expected keys."""
    import ensemble
    result = ensemble.aggregate(roberta_score=0.5, lr_score=0.5)
    assert set(result.keys()) == {
        "ai_probability", "label", "roberta_score", "lr_score", "confidence"
    }


def test_aggregate_confidence_range():
    """Confidence must be in [0, 1]."""
    import ensemble
    for r, l in [(0.0, 0.0), (1.0, 1.0), (0.5, 0.5), (0.9, 0.1)]:
        result = ensemble.aggregate(r, l)
        assert 0.0 <= result["confidence"] <= 1.0, (
            f"confidence={result['confidence']} out of range for r={r}, l={l}"
        )


def test_train_lr_creates_model_file(tmp_path, monkeypatch):
    """train_lr() must save a real sklearn LogisticRegression to lr_model.pkl."""
    import ensemble
    monkeypatch.setattr(ensemble, "LR_MODEL_PATH", tmp_path / "lr_model.pkl")
    monkeypatch.setattr(ensemble, "MODELS_DIR", tmp_path)

    rng = np.random.default_rng(42)
    X = rng.random((40, 8))
    y = [0] * 20 + [1] * 20

    ensemble.train_lr(X, y)

    assert (tmp_path / "lr_model.pkl").exists()
    model = joblib.load(tmp_path / "lr_model.pkl")
    assert isinstance(model, LogisticRegression)


def test_train_lr_model_predicts(tmp_path, monkeypatch):
    """Saved model must produce probabilities of shape (n, 2)."""
    import ensemble
    monkeypatch.setattr(ensemble, "LR_MODEL_PATH", tmp_path / "lr_model.pkl")
    monkeypatch.setattr(ensemble, "MODELS_DIR", tmp_path)

    rng = np.random.default_rng(0)
    X = rng.random((40, 8))
    y = [0] * 20 + [1] * 20
    ensemble.train_lr(X, y)

    model = joblib.load(tmp_path / "lr_model.pkl")
    proba = model.predict_proba(rng.random((5, 8)))
    assert proba.shape == (5, 2)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ai-service
python -m pytest tests/test_ensemble.py -v
```

Expected: `ModuleNotFoundError: No module named 'ensemble'`

- [ ] **Step 3: Create `ai-service/ensemble.py`**

```python
"""
ensemble.py — Ensemble aggregation and Logistic Regression training.

Functions
---------
aggregate(roberta_score, lr_score) -> dict
    Weighted combination (0.70 RoBERTa + 0.30 LR) → verdict dict.

train_lr(features, labels) -> None
    Train a LogisticRegression on 8-feature vectors, save to models/lr_model.pkl.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

MODELS_DIR = Path(__file__).parent / "models"
LR_MODEL_PATH = MODELS_DIR / "lr_model.pkl"


def aggregate(roberta_score: float, lr_score: float) -> Dict[str, Any]:
    """Combine RoBERTa and LR scores into a detection verdict.

    Weights: 0.70 × roberta_score + 0.30 × lr_score

    Args:
        roberta_score: AI probability [0, 1] from roberta-base-openai-detector.
        lr_score:      AI probability [0, 1] from the Logistic Regression model.

    Returns:
        Dictionary with keys:
          ai_probability (float) — weighted score in [0, 1]
          label          (str)   — "ai" if ai_probability >= 0.5 else "human"
          roberta_score  (float) — input value, rounded
          lr_score       (float) — input value, rounded
          confidence     (float) — distance from decision boundary, scaled to [0, 1]
    """
    ai_prob = round(0.70 * roberta_score + 0.30 * lr_score, 4)
    label = "ai" if ai_prob >= 0.5 else "human"
    # Map [0,1] score → [0,1] confidence: certainty is max at 0.0 and 1.0
    confidence = round(abs(ai_prob - 0.5) * 2.0, 4)
    return {
        "ai_probability": ai_prob,
        "label": label,
        "roberta_score": round(float(roberta_score), 4),
        "lr_score": round(float(lr_score), 4),
        "confidence": confidence,
    }


def train_lr(features: np.ndarray, labels: List[int]) -> None:
    """Train a LogisticRegression on 8-feature vectors and persist it to disk.

    Args:
        features: Array of shape (n_samples, 8) from statistical.extract_features.
        labels:   Binary list — 0 for human-written, 1 for AI-generated.
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    lr = LogisticRegression(max_iter=1000, random_state=42)
    lr.fit(features, labels)
    joblib.dump(lr, LR_MODEL_PATH)
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd ai-service
python -m pytest tests/test_ensemble.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-service/ensemble.py ai-service/tests/test_ensemble.py
git commit -m "feat(ai-service): add ensemble.py with aggregate() and train_lr()"
```

---

## Task 3: Edit `detector.py` to delegate to `statistical` and `ensemble`

**Files:**
- Modify: `ai-service/detector.py`
- Modify: `ai-service/tests/test_detector.py` (shape assertion: `(5,)` → `(8,)`)

- [ ] **Step 1: Update `extract_features()` in `detector.py`**

Find this function (lines 109–168 in detector.py):

```python
def extract_features(text: str) -> np.ndarray:
    """
    COMPONENT 1 — Statistical feature extractor
    ...
    """
    if not text.strip():
        return np.zeros(5)
    # ... (entire body with GPT-2 perplexity, burstiness, ttr, avg_sent_len, punct_density)
    return np.array([perplexity, burstiness, ttr, avg_sent_len, punct_density])
```

Replace the **entire function body** with a delegation to `statistical.py`. The signature is unchanged — `extract_features(text: str) -> np.ndarray` — but now returns shape `(8,)`:

```python
def extract_features(text: str) -> np.ndarray:
    """Delegate to statistical.extract_features for a single text string.

    Returns:
        np.ndarray of shape (8,) — one row of the 8-feature vector.
        Returns np.zeros(8) for empty input.
    """
    import statistical
    if not text or not text.strip():
        return np.zeros(8)
    return statistical.extract_features([text])[0]
```

After the edit, also **remove** these four lines from the top of `detector.py` (they are no longer needed in this module — GPT-2 is now owned by `statistical.py`):

```python
# Remove these 4 lines from the module-level globals block:
_gpt2_model = None
_gpt2_tokenizer = None
```

And remove the two GPT-2 loading lines from `load_models()`:

```python
# Remove these two lines from load_models():
_gpt2_tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")
_gpt2_model = GPT2LMHeadModel.from_pretrained("gpt2")
_gpt2_model.eval()
```

And remove the GPT-2 check from `is_model_loaded()`:

```python
# Remove _gpt2_model and _gpt2_tokenizer from the is_model_loaded() tuple:
# Before:
return all(m is not None for m in (_gpt2_model, _gpt2_tokenizer, _roberta_model, _roberta_tokenizer, _lr_model))
# After:
return all(m is not None for m in (_roberta_model, _roberta_tokenizer, _lr_model))
```

And update the imports at the top of `detector.py` — remove `GPT2LMHeadModel` and `GPT2TokenizerFast` from the `transformers` import:

```python
# Before:
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    GPT2LMHeadModel,
    GPT2TokenizerFast,
)

# After:
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
)
```

- [ ] **Step 2: Update `ensemble_score()` in `detector.py`**

Find `ensemble_score()` (currently returns `0.7 * r_score + 0.3 * l_score`):

```python
def ensemble_score(text: str) -> float:
    """
    COMPONENT 4 — Meta ensemble

    Weighted average: 0.7 * roberta + 0.3 * lr
    """
    r_score = roberta_score(text)
    l_score = lr_score(text)
    return 0.7 * r_score + 0.3 * l_score
```

Replace the body with:

```python
def ensemble_score(text: str) -> float:
    """Delegate to ensemble.aggregate and return the ai_probability float.

    Returns:
        Weighted AI probability in [0, 1].
    """
    import ensemble
    r_score = roberta_score(text)
    l_score = lr_score(text)
    return ensemble.aggregate(r_score, l_score)["ai_probability"]
```

- [ ] **Step 3: Update `test_extract_features` in `test_detector.py`**

The feature count has intentionally changed from 5 to 8. Find this assertion in `tests/test_detector.py`:

```python
    assert features.shape == (5,), (
        f"Expected shape (5,), got {features.shape}"
    )
```

Replace with:

```python
    assert features.shape == (8,), (
        f"Expected shape (8,), got {features.shape}"
    )
```

- [ ] **Step 4: Run the full existing test suite**

```bash
cd ai-service
python -m pytest tests/ -v
```

Expected: All tests PASS (test_health_check, test_detect_ai_generated_text, test_detect_human_text, test_extract_features, test_internal_extraction_structure, test_unsupported_file_type, test_is_scanned_pdf, all statistical tests, all ensemble tests).

- [ ] **Step 5: Commit**

```bash
git add ai-service/detector.py ai-service/tests/test_detector.py
git commit -m "refactor(ai-service): delegate extract_features and ensemble_score to statistical/ensemble"
```

---

## Task 4: Create `training/download_datasets.py`

**Files:**
- Create: `ai-service/training/download_datasets.py`
- Create: `ai-service/tests/test_download_datasets.py`

- [ ] **Step 1: Write the failing tests**

Create `ai-service/tests/test_download_datasets.py`:

```python
"""
test_download_datasets.py — Tests for dataset download logic.

HuggingFace network calls are mocked; tests only verify control flow and
output schema.
"""
from __future__ import annotations

import sys
from pathlib import Path
import pandas as pd
import pytest

# Add training/ directory to sys.path so we can import download_datasets directly
sys.path.insert(0, str(Path(__file__).parent.parent / "training"))


def test_download_skips_if_train_csv_exists(tmp_path):
    """download() must be a no-op when train.csv already exists."""
    import download_datasets as dd

    (tmp_path / "train.csv").write_text(
        "text,label\nThis is a human sentence with enough words.,0\n"
    )

    calls = []
    original_load_m4 = dd._load_m4

    def fake_load(*_):
        calls.append(1)
        return pd.DataFrame()

    dd._load_m4 = fake_load
    try:
        dd.download(tmp_path)
    finally:
        dd._load_m4 = original_load_m4

    assert calls == [], "download() should not have called _load_m4 when train.csv exists"


def test_download_creates_train_and_test_csvs(tmp_path, monkeypatch):
    """download() must produce train.csv and test.csv with 'text' and 'label' columns."""
    import download_datasets as dd

    fake_rows = [
        {"text": "Human sentence number one about everyday life experiences.", "label": 0},
        {"text": "AI generated paragraph about scientific discoveries and findings.", "label": 1},
        {"text": "Another human piece about personal stories and journeys.", "label": 0},
        {"text": "Machine generated text on technology trends in the industry.", "label": 1},
        {"text": "People often share their thoughts about food and travel.", "label": 0},
        {"text": "Language model output covering political topics globally.", "label": 1},
        {"text": "A personal diary entry written about weekend activities.", "label": 0},
        {"text": "Automated writing system output on various academic subjects.", "label": 1},
        {"text": "Casual blog post about gardening tips for beginners.", "label": 0},
        {"text": "GPT response discussing ethical considerations in AI research.", "label": 1},
    ]
    fake_df = pd.DataFrame(fake_rows)

    monkeypatch.setattr(dd, "_load_m4", lambda: fake_df.copy())
    monkeypatch.setattr(dd, "_load_gpt_wiki", lambda: pd.DataFrame())
    monkeypatch.setattr(dd, "_load_hc3", lambda: pd.DataFrame())

    dd.download(tmp_path)

    assert (tmp_path / "train.csv").exists(), "train.csv not created"
    assert (tmp_path / "test.csv").exists(), "test.csv not created"

    train = pd.read_csv(tmp_path / "train.csv")
    test = pd.read_csv(tmp_path / "test.csv")

    assert "text" in train.columns
    assert "label" in train.columns
    assert len(train) + len(test) == len(fake_rows)
    assert len(train) > 0
    assert len(test) > 0


def test_download_80_20_split(tmp_path, monkeypatch):
    """Train split must be ~80% of the total rows."""
    import download_datasets as dd

    fake_rows = [
        {"text": f"Sentence number {i} with enough words to pass the filter here.", "label": i % 2}
        for i in range(100)
    ]
    monkeypatch.setattr(dd, "_load_m4", lambda: pd.DataFrame(fake_rows))
    monkeypatch.setattr(dd, "_load_gpt_wiki", lambda: pd.DataFrame())
    monkeypatch.setattr(dd, "_load_hc3", lambda: pd.DataFrame())

    dd.download(tmp_path)

    train = pd.read_csv(tmp_path / "train.csv")
    test = pd.read_csv(tmp_path / "test.csv")
    total = len(train) + len(test)
    assert abs(len(train) / total - 0.80) < 0.05
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd ai-service
python -m pytest tests/test_download_datasets.py -v
```

Expected: `ModuleNotFoundError: No module named 'download_datasets'`

- [ ] **Step 3: Create `ai-service/training/download_datasets.py`**

```python
"""
download_datasets.py — Download and unify three HuggingFace datasets for LR training.

Usage
-----
Standalone:
    cd ai-service && python training/download_datasets.py

From another script:
    from download_datasets import download
    download(Path("training/datasets"))

Output schema: CSV with columns [text (str), label (int: 0=human, 1=ai)]
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import pandas as pd
from tqdm import tqdm

logger = logging.getLogger(__name__)

# Maximum rows to take from each dataset (keeps LR feature extraction practical)
_MAX_ROWS = 5_000

OUTPUT_DIR = Path(__file__).parent / "datasets"


def _load_m4() -> pd.DataFrame:
    """Load NicolaiSivesind/m4 — multi-domain AI vs human text.

    Returns:
        DataFrame with columns [text, label].
    """
    from datasets import load_dataset

    rows = []
    try:
        ds = load_dataset(
            "NicolaiSivesind/m4", split="train", trust_remote_code=True
        )
        for item in tqdm(ds, desc="M4", total=min(_MAX_ROWS * 2, len(ds))):
            text = (item.get("text") or "").strip()
            label_raw = item.get("label", -1)
            if isinstance(label_raw, int) and label_raw in (0, 1) and len(text) > 50:
                rows.append({"text": text, "label": label_raw})
            if len(rows) >= _MAX_ROWS * 2:
                break
    except Exception as exc:
        logger.warning("M4 download failed: %s", exc)
    return pd.DataFrame(rows)


def _load_gpt_wiki() -> pd.DataFrame:
    """Load aadityaubhat/GPT-wiki-intro — Wikipedia intros (human vs GPT).

    Returns:
        DataFrame with columns [text, label].
    """
    from datasets import load_dataset

    rows = []
    try:
        ds = load_dataset(
            "aadityaubhat/GPT-wiki-intro", split="train", trust_remote_code=True
        )
        for item in tqdm(ds, desc="GPT-wiki-intro"):
            human = (item.get("wiki_intro") or "").strip()
            ai = (item.get("generated_intro") or "").strip()
            if len(human) > 50:
                rows.append({"text": human, "label": 0})
            if len(ai) > 50:
                rows.append({"text": ai, "label": 1})
            if len(rows) >= _MAX_ROWS * 2:
                break
    except Exception as exc:
        logger.warning("GPT-wiki-intro download failed: %s", exc)
    return pd.DataFrame(rows)


def _load_hc3() -> pd.DataFrame:
    """Load Hello-SimpleAI/HC3 — human vs ChatGPT answers.

    Returns:
        DataFrame with columns [text, label].
    """
    from datasets import load_dataset

    rows = []
    try:
        ds = load_dataset(
            "Hello-SimpleAI/HC3", "all", split="train", trust_remote_code=True
        )
        for item in tqdm(ds, desc="HC3"):
            for ans in (item.get("human_answers") or []):
                if isinstance(ans, str) and len(ans.strip()) > 50:
                    rows.append({"text": ans.strip(), "label": 0})
            for ans in (item.get("chatgpt_answers") or []):
                if isinstance(ans, str) and len(ans.strip()) > 50:
                    rows.append({"text": ans.strip(), "label": 1})
            if len(rows) >= _MAX_ROWS * 2:
                break
    except Exception as exc:
        logger.warning("HC3 download failed: %s", exc)
    return pd.DataFrame(rows)


def download(output_dir: Optional[Path] = None) -> None:
    """Download, merge, and split datasets into train.csv and test.csv.

    Skips entirely if train.csv already exists in *output_dir*.

    Args:
        output_dir: Directory to save CSVs. Defaults to training/datasets/.
    """
    if output_dir is None:
        output_dir = OUTPUT_DIR
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_path = output_dir / "train.csv"
    if train_path.exists():
        print("Dataset already exists, skipping.")
        return

    print("Downloading datasets from HuggingFace…")
    frames = [_load_m4(), _load_gpt_wiki(), _load_hc3()]
    combined = pd.concat(
        [f for f in frames if not f.empty], ignore_index=True
    )

    if combined.empty:
        raise RuntimeError(
            "All three dataset downloads failed. "
            "Check your internet connection and try again."
        )

    combined = (
        combined.dropna(subset=["text", "label"])
        .assign(label=lambda df: df["label"].astype(int))
        .sample(frac=1, random_state=42)
        .reset_index(drop=True)
    )

    split = int(len(combined) * 0.80)
    combined.iloc[:split].to_csv(train_path, index=False)
    combined.iloc[split:].to_csv(output_dir / "test.csv", index=False)

    print(
        f"Saved {split:,} training rows and "
        f"{len(combined) - split:,} test rows to {output_dir}/"
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    download()
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd ai-service
python -m pytest tests/test_download_datasets.py -v
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Confirm existing tests still pass**

```bash
python -m pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add ai-service/training/download_datasets.py ai-service/tests/test_download_datasets.py
git commit -m "feat(ai-service): add training/download_datasets.py with HF dataset pipeline"
```

---

## Task 5: Create `training/setup_detection.py`

**Files:**
- Create: `ai-service/training/setup_detection.py`

*(No unit test for this file — it is an integration runner. Verification is by running it end-to-end in Task 6.)*

- [ ] **Step 1: Create `ai-service/training/setup_detection.py`**

```python
"""
setup_detection.py — One-shot training pipeline for VaultIQ AI detection.

Run once to build a real lr_model.pkl from downloaded datasets.

Usage:
    cd ai-service
    python training/setup_detection.py

Steps
-----
1. Download datasets → training/datasets/train.csv + test.csv
2. Extract 8 statistical features → training/outputs/lr_features.npz
3. Train LogisticRegression → models/lr_model.pkl
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

# Make ai-service/ importable (statistical, ensemble live there)
_ROOT = Path(__file__).parent.parent  # ai-service/
sys.path.insert(0, str(_ROOT))

# Make training/ importable (download_datasets lives here)
sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

_DATASETS_DIR = Path(__file__).parent / "datasets"
_OUTPUTS_DIR = Path(__file__).parent / "outputs"
_LR_MODEL_PATH = _ROOT / "models" / "lr_model.pkl"


def _is_real_lr(path: Path) -> bool:
    """Return True only if *path* contains a trained sklearn LogisticRegression."""
    if not path.exists():
        return False
    try:
        import joblib
        from sklearn.linear_model import LogisticRegression
        model = joblib.load(path)
        return isinstance(model, LogisticRegression)
    except Exception:
        return False


def run() -> None:
    """Execute the three training steps in order."""
    _OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    # ── Step 1: Download datasets ──────────────────────────────────────────
    print("\n[Step 1/3] Downloading datasets…")
    from download_datasets import download
    download(_DATASETS_DIR)

    # ── Step 2: Extract statistical features ──────────────────────────────
    features_path = _OUTPUTS_DIR / "lr_features.npz"

    if features_path.exists():
        print("\n[Step 2/3] lr_features.npz already exists — skipping extraction.")
        import numpy as np
        data = np.load(features_path)
        X, y = data["X"], data["y"]
        print(f"  Loaded features: shape {X.shape}")
    else:
        print("\n[Step 2/3] Extracting statistical features for LR training…")
        import numpy as np
        import pandas as pd
        from tqdm import tqdm
        import statistical

        train_df = pd.read_csv(_DATASETS_DIR / "train.csv")
        texts = train_df["text"].tolist()
        y = train_df["label"].astype(int).to_numpy()

        all_feats = []
        batch_size = 50
        for i in tqdm(range(0, len(texts), batch_size), desc="Feature extraction"):
            batch = texts[i : i + batch_size]
            feats = statistical.extract_features(batch)
            all_feats.append(feats)

        X = np.vstack(all_feats)
        np.savez(features_path, X=X, y=y)
        print(f"  Features saved: shape {X.shape}")

    # ── Step 3: Train Logistic Regression ─────────────────────────────────
    if _is_real_lr(_LR_MODEL_PATH):
        print("\n[Step 3/3] Real lr_model.pkl already exists — skipping training.")
    else:
        print("\n[Step 3/3] Training Logistic Regression…")
        import ensemble
        ensemble.train_lr(X, y.tolist())
        print(f"  Model saved to {_LR_MODEL_PATH}")

        # Evaluate on test split
        import numpy as np
        import pandas as pd
        from tqdm import tqdm
        import statistical, joblib

        test_df = pd.read_csv(_DATASETS_DIR / "test.csv")
        test_texts = test_df["text"].tolist()
        y_test = test_df["label"].astype(int).to_numpy()

        test_feats = []
        batch_size = 50
        for i in tqdm(range(0, len(test_texts), batch_size), desc="Test features"):
            batch = test_texts[i : i + batch_size]
            test_feats.append(statistical.extract_features(batch))

        X_test = np.vstack(test_feats)
        acc = joblib.load(_LR_MODEL_PATH).score(X_test, y_test)
        print(f"  Test accuracy: {acc:.3f}")

    print("\nSetup complete. Run your server and POST to /detect")


if __name__ == "__main__":
    run()
```

- [ ] **Step 2: Verify the script is importable without running training**

```bash
cd ai-service
python -c "import sys; sys.path.insert(0, 'training'); import setup_detection; print('Import OK')"
```

Expected: `Import OK`

- [ ] **Step 3: Commit**

```bash
git add ai-service/training/setup_detection.py
git commit -m "feat(ai-service): add training/setup_detection.py — 3-step LR training pipeline"
```

---

## Task 6: End-to-end Verification

- [ ] **Step 1: Confirm the full test suite is green**

```bash
cd ai-service
python -m pytest tests/ -v
```

Expected: All tests PASS. No existing test should have regressed.

- [ ] **Step 2: Confirm module imports are clean**

```bash
python -c "import statistical; import ensemble; print('Modules OK')"
```

Expected: `Modules OK`

- [ ] **Step 3: Start the server — confirm clean startup**

```bash
uvicorn main:app --reload --port 8000
```

Expected: Server starts without errors. Log shows `INFO: Application startup complete.`

- [ ] **Step 4: Smoke-test the `/detect` endpoint**

In a separate terminal:

```bash
curl -s -X POST http://localhost:8000/detect \
  -F "file=@dummy_test_doc.txt" | python -m json.tool
```

Expected response shape (exact values will vary):

```json
{
  "results": [
    {
      "filename": "dummy_test_doc.txt",
      "raw_text_preview": "...",
      "chunks_count": 2,
      "status": "ok",
      "score": 0.42,
      "verdict": "mixed",
      "confidence": "low",
      "chunk_scores": [0.38, 0.45],
      "warning": "Low chunk count (< 3). Score may be unreliable."
    }
  ],
  "model_warning": "LR model unavailable — using dummy classifier. ..."
}
```

> `model_warning` will be present until you run `setup_detection.py` — this is expected.

- [ ] **Step 5: Run `setup_detection.py` (optional — requires internet + ~30–60 min for GPT-2 feature extraction)**

```bash
cd ai-service
python training/setup_detection.py
```

Expected output:
```
[Step 1/3] Downloading datasets…
Downloading datasets from HuggingFace…
...
Saved X training rows and Y test rows to training/datasets/

[Step 2/3] Extracting statistical features for LR training…
Feature extraction: 100%|██████| ...
  Features saved: shape (N, 8)

[Step 3/3] Training Logistic Regression…
  Model saved to models/lr_model.pkl
Test features: 100%|██████| ...
  Test accuracy: 0.XXX

Setup complete. Run your server and POST to /detect
```

After this runs, restart the server. The `model_warning` field in responses will be `null`.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(ai-service): verify end-to-end detection pipeline is working"
```

---

## Self-Review Checklist

| Spec requirement | Task covering it |
|-----------------|-----------------|
| `statistical.py` with 8 features, GPT-2 singleton | Task 1 |
| `ensemble.py` with `aggregate()` and `train_lr()` | Task 2 |
| `detector.py` delegates to statistical + ensemble | Task 3 |
| Missing packages added to `requirements.txt` | Task 0 |
| `training/download_datasets.py` — 3 HF datasets, idempotent | Task 4 |
| `training/setup_detection.py` — 3-step pipeline | Task 5 |
| All existing tests still pass | Task 3 (run), Task 6 (confirm) |
| No changes to routes, extractor, preprocessor | Confirmed — not in File Map |
| Lazy loading for all heavy models | `statistical._ensure_gpt2()` |
| Real `lr_model.pkl` replaces DummyLR after training | Task 5 Step 1 |
