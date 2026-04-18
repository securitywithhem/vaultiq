# VaultIQ AI Detection Service

## Overview
FastAPI-based microservice for detecting AI-generated content in documents (PDF, DOCX, TXT).

## Project Structure

```
ai-service/
├── main.py                 # FastAPI entry point with /health and /detect endpoints
├── core/                   # Production detection pipeline
│   ├── __init__.py
│   ├── detector.py        # AI detection ensemble (RoBERTa + Logistic Regression)
│   ├── extractor.py       # Text extraction from PDFs, DOCX, TXT
│   └── preprocessor.py    # Text chunking and preprocessing
├── models/                # Trained ML models
│   ├── lr_model.pkl       # Logistic Regression classifier
│   ├── tfidf.pkl          # TF-IDF vectorizer
│   └── tfidf_matrix.pkl   # Pre-computed TF-IDF matrix
├── tests/                 # Production tests
│   ├── test_detector.py   # Detection pipeline tests
│   └── test_extractor.py  # Text extraction tests
├── docs/                  # Documentation
│   └── DATASET_TRAINING_GUIDE.md
└── README.md              # This file
```

## API Endpoints

### POST /detect
Process uploaded files through the AI detection pipeline.

**Request:**
- Multipart form data with up to 5 files (pdf/docx/txt)

**Response:**
```json
{
  "results": [
    {
      "filename": "document.pdf",
      "raw_text_preview": "First 300 characters...",
      "chunks_count": 42,
      "score": 0.75,
      "verdict": "ai_generated",
      "confidence": "high",
      "chunk_scores": [0.8, 0.7, ...],
      "warning": null,
      "status": "ok"
    }
  ],
  "model_warning": null
}
```

### POST /detect/text
Detect AI content in raw text input.

**Request:**
```json
{
  "text": "Content to analyze...",
  "document_id": "optional-doc-id"
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "model_loaded": true,
  "version": "0.1.0"
}
```

## Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Start the service
uvicorn main:app --reload --port 8000
```

## Detection Pipeline

The service uses a meta-ensemble combining:

1. **RoBERTa Classifier** - Fine-tuned transformer model for text classification
2. **Logistic Regression** - Statistical features over text (perplexity, burstiness, type-token ratio, etc.)
3. **Weighted Average** - 70% RoBERTa + 30% Logistic Regression

## Cleanup History

**Removed dead code:**
- `ensemble.py` - Unused module
- `statistical.py` - Only used in abandoned tests
- `similarity.py` - Incomplete similarity search (dependency chain broken)
- `similarity_ensemble.py` - Non-existent module
- Data processing scripts (`prepare_datasets.py`, `merge_*`, `download_*`)
- Model training script (`train_lr.py`)
- Tests for dead modules (`test_ensemble.py`, `test_statistical.py`)

**Fixed bugs:**
- Removed dead similarity integration code that referenced non-existent `similarity_ensemble` module
- Removed unused `_SIMILARITY_AVAILABLE` flag

**Organized structure:**
- Moved core modules to `core/` directory
- Created proper Python package with `core/__init__.py`
- Updated all imports to reference new structure
- Separated documentation to `docs/` directory
