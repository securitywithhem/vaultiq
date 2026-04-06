# AI Detection Microservice

Dual **plagiarism** + **AI-generated text** detection service for the
Secure Distributed Cloud Storage System.

- **Stack**: Python · FastAPI · PyTorch · HuggingFace Transformers · FAISS
- **Port**: `8000` (default)
- **Node.js backend**: expected at `http://localhost:5000`

---

## Directory Structure

```
ai_service/
├── main.py                     # FastAPI app entry point
├── requirements.txt
├── config.py                   # All constants & thresholds
├── models/
│   ├── plagiarism_model.py     # SBERT + FAISS pipeline
│   └── ai_detector_model.py   # DistilBERT + RF hybrid
├── services/
│   ├── text_extractor.py       # PDF / DOCX extraction
│   ├── preprocessor.py         # NLP cleaning pipeline
│   ├── feature_extractor.py    # Statistical + GPT-2 features
│   ├── plagiarism_service.py   # Plagiarism orchestration
│   └── ai_detection_service.py # AI detection orchestration
├── schemas/
│   └── request_response.py     # Pydantic v2 models
├── training/
│   ├── data_loader.py          # Dataset download & preparation
│   ├── train_random_forest.py  # RF training script
│   └── train_distilbert.py     # DistilBERT fine-tuning script
├── utils/
│   └── helpers.py              # Shared utilities
└── data/
    ├── faiss_index.bin          # FAISS corpus index (auto-created)
    ├── corpus_metadata.json     # Corpus doc metadata (auto-created)
    └── processed/               # Parquet training splits
```

---

## Setup

### 1. Create & activate a virtual environment

```bash
cd ai_service
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

> **GPU users**: replace `torch==2.3.1` in `requirements.txt` with the
> appropriate CUDA wheel from [pytorch.org](https://pytorch.org/get-started/locally/).

### 3. First-run NLTK data

Downloaded automatically on first startup. No manual step needed.

---

## Running the API

```bash
# Development (auto-reload)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production (single worker — required to share model state)
python main.py
```

API docs available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## Running the Training Scripts

### Step 1 — Prepare datasets

```bash
python -m training.data_loader
```

Downloads and merges three HuggingFace datasets, deduplicates, balances,
and saves Parquet splits to `data/processed/`.

### Step 2 — Train Random Forest

```bash
python -m training.train_random_forest
```

- 5-fold GridSearchCV over `n_estimators` and `max_depth`
- Saves best model → `models/rf_classifier.joblib`
- Prints feature importances after training

### Step 3 — Fine-tune DistilBERT *(optional but recommended)*

```bash
python -m training.train_distilbert
```

- Fine-tunes `distilbert-base-uncased` for 3 epochs with early stopping
- Evaluates every 500 steps on the validation set
- Saves best checkpoint → `models/distilbert_ai_detector/`
- Prints per-evaluation loss, accuracy, F1, ROC-AUC

> **Without training**: the API starts in **RF-only / heuristic mode**.
> Detection still works; DistilBERT confidence will mirror RF confidence.

---

## API Endpoints

### `GET /health`

```json
{ "status": "ok", "models_loaded": true }
```

---

### `POST /detect`  — JSON text payload

```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "Your text here...", "document_id": "doc-001"}'
```

---

### `POST /detect/file`  — PDF or DOCX upload

```bash
curl -X POST http://localhost:8000/detect/file \
  -F "file=@/path/to/document.pdf"
```

---

### `POST /corpus/add`  — Add document to plagiarism corpus

```bash
curl -X POST http://localhost:8000/corpus/add \
  -H "Content-Type: application/json" \
  -d '{"text": "Reference text...", "doc_id": "ref-001", "title": "My Paper"}'
```

---

## Calling from Node.js (axios)

```js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const AI_SERVICE_URL = 'http://localhost:8000';

// ── Text detection ────────────────────────────────────────────────────────────
async function detectText(text, documentId) {
  const { data } = await axios.post(`${AI_SERVICE_URL}/detect`, {
    text,
    document_id: documentId,
  });
  return data;
}

// ── File detection ────────────────────────────────────────────────────────────
async function detectFile(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const { data } = await axios.post(`${AI_SERVICE_URL}/detect/file`, form, {
    headers: form.getHeaders(),
    maxContentLength: 20 * 1024 * 1024,  // 20 MB axios limit
  });
  return data;
}

// ── Add to corpus ─────────────────────────────────────────────────────────────
async function addToCorpus(text, docId, title = '') {
  const { data } = await axios.post(`${AI_SERVICE_URL}/corpus/add`, {
    text,
    doc_id: docId,
    title,
  });
  return data;
}

// ── Example usage ─────────────────────────────────────────────────────────────
(async () => {
  const result = await detectText(
    'The quick brown fox jumps over the lazy dog.',
    'test-doc-001'
  );
  console.log(JSON.stringify(result, null, 2));
})();
```

---

## Response Schema

```json
{
  "document_id": "doc-001",
  "plagiarism": {
    "score": 0.0,
    "percentage": 0.0,
    "verdict": "CLEAN",
    "matched_segments": [
      {
        "text": "matched window text",
        "similarity": 0.91,
        "matched_doc_id": "ref-001",
        "start_char": 42,
        "end_char": 180
      }
    ]
  },
  "ai_detection": {
    "probability": 0.73,
    "percentage": 73.0,
    "verdict": "LIKELY_AI",
    "features": {
      "perplexity": 34.2,
      "burstiness": 0.3,
      "entropy": 4.1,
      "repetition_rate": 0.08
    },
    "distilbert_confidence": 0.81,
    "rf_confidence": 0.61
  },
  "overall": {
    "risk_score": 0.37,
    "verdict": "SUSPICIOUS",
    "processing_time_ms": 412
  }
}
```

---

## Verdict Reference

| Domain       | Verdict      | Condition              |
|------------- |------------- |----------------------- |
| Plagiarism   | CLEAN        | score < 0.10           |
| Plagiarism   | LOW_RISK     | 0.10 ≤ score < 0.30    |
| Plagiarism   | MEDIUM       | 0.30 ≤ score < 0.60    |
| Plagiarism   | HIGH_RISK    | score ≥ 0.60           |
| AI Detection | HUMAN        | prob < 0.20            |
| AI Detection | LIKELY_HUMAN | 0.20 ≤ prob < 0.40     |
| AI Detection | UNCERTAIN    | 0.40 ≤ prob < 0.60     |
| AI Detection | LIKELY_AI    | 0.60 ≤ prob < 0.80     |
| AI Detection | AI           | prob ≥ 0.80            |
| Overall      | CLEAN        | risk < 0.30            |
| Overall      | SUSPICIOUS   | 0.30 ≤ risk < 0.65     |
| Overall      | HIGH_RISK    | risk ≥ 0.65            |
