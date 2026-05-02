# VaultIQ Project Structure

## 📂 Directory Organization

```
vaultiq/
├── ai-service/                    # AI Detection Microservice
│   ├── core/
│   │   ├── detector.py           # Main detection pipeline (RoBERTa + LR ensemble)
│   │   ├── preprocessor.py       # Text preprocessing & chunking
│   │   ├── extractor.py          # Feature extraction utilities
│   │   └── __init__.py
│   ├── models/                    # Trained model artifacts
│   │   ├── lr_model_calibrated.pkl    # Logistic Regression (14.4MB)
│   │   ├── lr_model.pkl              # LR fallback (2.7MB)
│   │   ├── scaler.pkl                # Feature scaler
│   │   ├── ensemble_config.json      # Blend weights & threshold
│   │   └── training_metrics*.json
│   ├── datasets/                  # Training/evaluation datasets
│   ├── tests/                     # Unit & integration tests
│   │   ├── test_detector.py
│   │   ├── test_extractor.py
│   │   └── test_integration.py
│   ├── scripts/                   # Model training & utility scripts
│   │   ├── train_both_lr_roberta.py     # Train LR + Fine-tune RoBERTa
│   │   ├── retrain_with_enhanced_features.py  # LR training with 20 features
│   │   ├── retrain_lr_v5.py             # Previous LR training script
│   │   └── optimize_ensemble.py         # Ensemble weight tuning
│   ├── docs/                      # AI service documentation
│   │   ├── DATASET_TRAINING_GUIDE.md
│   │   ├── COLAB_TRAINING_GUIDE.md (if exists)
│   │   └── training analysis docs
│   └── main.py                    # FastAPI entry point
│
├── backend/                       # Node.js/Express backend
│   ├── routes/                    # API endpoints
│   ├── middleware/
│   ├── validators/
│   ├── utils/
│   ├── tests/
│   ├── scripts/                   # Data processing scripts
│   ├── data/                      # Raw/processed data
│   └── package.json
│
├── frontend/                      # React frontend
│   ├── src/
│   ├── public/
│   ├── build/                     # Production build
│   └── package.json
│
├── bigdata/                       # Spark/HDFS analytics
│   ├── analytics_job.py           # Spark job runner
│   ├── scripts/                   # Data pipeline scripts
│   ├── tests/
│   ├── results/                   # Job output
│   └── README.md
│
├── nginx/                         # Reverse proxy config
├── scripts/                       # Root-level utilities
├── docs/                          # Project documentation
│   ├── api/
│   ├── architecture/
│   ├── presentation_assets/
│   ├── superpowers/               # Planning & spec documents
│   └── *.md analysis files
│
├── CLAUDE.md                      # Claude Code configuration
├── README.md                      # Main project README
└── PROJECT_STRUCTURE.md           # This file
```

## 🤖 AI Model Status

### Ensemble Architecture
- **RoBERTa** (70% weight): Fine-tuned transformer for text classification
- **Logistic Regression** (30% weight): Statistical ML on extracted features
- **Detection Threshold**: 0.55 (configurable via `ensemble_config.json`)

### Feature Pipeline
- **Statistical Features**: 13 custom text metrics (entropy, character distribution, etc.)
- **spaCy Features**: 4 NLP-based features (POS tags, named entities, etc.)
- **Semantic Features**: 3 sentence-transformer embeddings (all-MiniLM-L6-v2)
- **Total**: 20 features for LR model

### Model Files
| File | Size | Purpose |
|------|------|---------|
| `lr_model_calibrated.pkl` | 14.4MB | Primary LR model (Platt scaling) |
| `lr_model.pkl` | 2.7MB | Fallback uncalibrated LR |
| `scaler.pkl` | ~500KB | Feature scaling (RobustScaler) |
| `ensemble_config.json` | <1KB | Weights: w_roberta=0.7, w_lr=0.3 |

### Training Scripts
- **train_both_lr_roberta.py**: End-to-end training on modern_llm_corpus (80% sample)
- **retrain_with_enhanced_features.py**: LR-only training with 20-feature pipeline
- **retrain_lr_v5.py**: Legacy LR training script
- **optimize_ensemble.py**: Hyperparameter tuning for blend weights

## 📋 Core Services

### AI Service (Port 8000)
- **Endpoint**: `/detect` - Upload PDF/DOCX/TXT files
- **Response**: AI detection scores with confidence
- **Supported Formats**: PDF, DOCX, TXT (max 5 files per request)

### Backend (Node.js/Express)
- API routing, database operations
- Middleware for auth/validation
- Data processing pipelines

### Frontend (React)
- Web interface for document upload
- Results visualization
- User authentication

### Big Data (Spark)
- Event log analytics
- HDFS storage backend
- AWS S3 backup

## 🧹 Cleanup Summary (Latest Commit)

**Deleted** (obsolete):
- `mypy.ini` - unmaintained type checking config
- `diagnose_demo.py` - outdated diagnostic script
- `prepare_modern_data.py` - data prep script (merged into training)
- `test_modern_llms.py` - old test suite

**Moved to `docs/`** (organization):
- AI_ENGINEER_DETAILED_ANALYSIS.md
- BUILTIN_VS_CUSTOM_ANALYSIS.md
- IMPLEMENTATION_TRANSFORMERS_SPACY.md
- QUICK_START_ENHANCED_AI.md

**Added** (new utilities):
- `train_both_lr_roberta.py` - comprehensive training pipeline
- `retrain_with_enhanced_features.py` - enhanced feature training

## ✅ Project Health

- **Files**: 73 total
- **Code Nodes**: 347 (202 functions, 10 classes, 62 tests)
- **Test Coverage**: 266 tested nodes
- **Languages**: Python + JavaScript
- **Status**: Production-ready with active model tuning

## 🚀 Quick Start

### Run AI Detection Service
```bash
cd ai-service
pip install -r requirements.txt
python main.py  # Starts FastAPI on :8000
```

### Train Models
```bash
cd ai-service
python scripts/train_both_lr_roberta.py      # Full pipeline
# or
python scripts/retrain_with_enhanced_features.py  # LR only
```

### Run Analytics
```bash
cd bigdata
spark-submit analytics_job.py
```

## 📚 Documentation
- Architecture: `docs/architecture/`
- API Reference: `docs/api/`
- Training Guide: `ai-service/docs/`
- Planning Docs: `docs/superpowers/`
