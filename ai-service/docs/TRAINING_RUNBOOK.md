# AI Detection Training Runbook

How to rebuild every learned component of the detector. All scripts share
`scripts/training_data.py`, which guarantees training sees exactly what `detect()` sees
at serving time: one 3-5-sentence chunk per answer, features computed by `core/detector.py`
with GPT-2 loaded.

## 1. Environment

The model pickles require the pinned scikit-learn (1.3.2), so use a dedicated venv:

```bash
cd ai-service
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt spacy==3.7.2 pytest==7.4.3 httpx==0.25.2
.venv/bin/pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl
.venv/bin/python -m pytest tests -q
```

Prefix long runs with `TOKENIZERS_PARALLELISM=false` and keep the machine awake (`caffeinate -i` on macOS).

## 2. Data

```bash
.venv/bin/python scripts/training_data.py download   # HC3 → datasets/all.jsonl (gitignored)
```

| Split | Source | Used for |
|---|---|---|
| train | HC3 reddit_eli5 / open_qa / finance (≈90% of questions) + `datasets/modern_llm_corpus.csv` if present | fitting models |
| val | ≈10% of the same domains, split by question | early stopping, ensemble weights, threshold |
| test | HC3 medicine + wiki_csai | reporting only — never tuned on |

Features are cached as `datasets/features_<split>_<n>_<tag>.npz`; the tag changes whenever the
embedding model changes. RoBERTa scores are cached separately (`roberta_<split>_<n>.npz`).

## 3. Pipeline (in order)

| Step | Command | Output | Time (M-series Mac) |
|---|---|---|---|
| Fine-tune embeddings (optional) | `scripts/finetune_embeddings.py` | `models/embedding_model/` (only if val probe AUC improves) | ~30 min |
| Feature model | `scripts/retrain_with_enhanced_features.py` | `models/lr_model_v6_calibrated.pkl`, `training_metrics_v6.json` | ~75 min features + ~5 min fit |
| Neural head | `scripts/train_neural_head.py` | `models/neural_head.pt`, `neural_head_meta.json` | ~3 min |
| Ensemble weights | `scripts/optimize_ensemble.py --exclude-nn` | `models/ensemble_config.json` | ~2 min (≈20 min first run for RoBERTa scores) |

Re-run the feature model and neural head after any embedding change. Use `--exclude-nn` until
validation is moved to a held-out domain: the val split shares domains with training, which
rewards the neural head's topic overfitting (see `docs/architecture/ai-detection.md`, Results).

## 4. Deploy

Model files are gitignored (`*.pkl`, `*.pt`, `models/embedding_model/`); ship them alongside
the code (Docker `COPY . .` includes `models/`). Only `ensemble_config.json` is tracked.
To roll back, delete the new files — the detector falls back to `lr_model.pkl`, stock MiniLM
and no neural head — and restore `ensemble_config.json` from git.

## 5. Known limitations

- `Hello-SimpleAI/chatgpt-detector-roberta` is believed to be trained on HC3, so HC3 numbers
  (held-out domains included) overstate its performance on unseen text. A fair evaluation
  needs a corpus RoBERTa has not seen (e.g. text from GPT-4/Claude/Gemini).
- HC3 is ChatGPT-3.5-era English Q&A only.
