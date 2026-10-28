# 🤖 VaultIQ AI Detection Pipeline — Complete Flow & Architecture (Updated 2026-10-28)

## 📋 Overview

The VaultIQ AI detection battery utilizes a **hybrid ensemble architecture** that cross-evaluates semantic signals against structural and statistical text indicators.

The system combines:
1. **RoBERTa Classifiers** — two checkpoints, averaged (deep learning)
2. **Feature model** — calibrated gradient-boosted classifier over 25 features (historically called "LR")
3. **Sentence embeddings** — MiniLM fine-tuned for human-vs-AI separation (deep learning)
4. **Neural head** — MLP over [chunk embedding ‖ 25 features] (deep learning; currently weight 0, see Results)
5. **GPT-2** (perplexity feature)
6. **Multimodal Extraction** (PDF/DOCX/OCR/Video-to-Text)

---

## 🔄 Complete Detection Flow

```
User Document (PDF/DOCX/TXT/Image/Video)
    ↓
[1. SMART EXTRACTION]
    ├─ Extract text layer (pdfplumber/docx)
    ├─ OCR for images & scanned PDFs (Tesseract)
    ├─ Audio extraction & transcription (Whisper + FFmpeg)
    └─ Unified text normalization
    ↓
[2. PREPROCESSING]
    ├─ Whitespace cleanup
    └─ spaCy sentence split → chunks of 3-5 sentences (each chunk scored independently)
    ↓
[3. PER-CHUNK SCORING] ───────────────┬──────────────────────────────┐
    build_feature_vector() → 25 dims  │ [4A. ROBERTA]                │
    ├─ 13 statistical (GPT-2 perplexity,  │ chatgpt-detector-roberta  │
    │     burstiness, TTR, …)          │ + roberta-base-openai-     │
    ├─  4 spaCy (passive, POS, NER, depth)│   detector, averaged       │
    ├─  3 semantic (sentence coherence…)  │                            │
    └─  5 document-embedding              │                            │
    ↓                                     │                            │
[4B. FEATURE MODEL]  → P(AI)              │                            │
[4C. NEURAL HEAD]    → P(AI) (if w_nn > 0)│                            │
    └─────────────────────────────────────┴────────────────────────────┘
    ↓
[5. ENSEMBLE FUSION]  (weights + threshold from models/ensemble_config.json)
    ├─ chunk score = w_roberta·R + w_lr·L + w_nn·N   (currently 0.90 / 0.10 / 0.00)
    ├─ document score = mean of chunk scores
    └─ Thresholding (Human / Mixed / AI)
    ↓
[RESPONSE]
    ├─ Probability Score
    ├─ Verdict (Human/Mixed/AI)
    ├─ Confidence (High/Medium/Low)
    ├─ Chunk-level scoring breakdown
    └─ Processing Metadata
```

---

## 🧠 Components & Rationale

### **1. RoBERTa Classifiers**

- `Hello-SimpleAI/chatgpt-detector-roberta` (ChatGPT-era) and `roberta-base-openai-detector` (GPT-2-era); their AI probabilities are averaged.
- **Weight:** 0.90 (primary signal).
- ⚠️ The Hello-SimpleAI checkpoint was released by the HC3 authors and is believed to be trained on HC3, so its scores on HC3 (including our held-out domains) are likely optimistic.

---

### **2. Feature model (`core/detector.py` → `lr_score_enhanced`)**

A calibrated `HistGradientBoostingClassifier` (isotonic, 5-fold) over `build_feature_vector()`:

| Group | Count | Features |
|---|---|---|
| Statistical | 13 | GPT-2 perplexity, burstiness, TTR, avg sentence length, punctuation density, word entropy, avg word length, capitalisation density, formal / citation / technical / passive / complex-sentence ratios |
| spaCy | 4 | passive voice (dependency), POS diversity, NER density, dependency depth |
| Semantic | 3 | adjacent-sentence coherence, its variance, mean-embedding norm |
| Document embedding (`core/embeddings.py`) | 5 | mean/max-pool divergence, redundancy (max non-adjacent similarity), centroid spread, PC1 variance ratio, attention-pooling entropy |

- **Weight:** 0.10. Model file: first existing of `lr_model_v6_calibrated.pkl` → `lr_model_calibrated.pkl` → `lr_model.pkl`.
- Feature order is append-only; a model trained on fewer features is scored on the leading ones (`n_features_in_`).

---

### **3. Sentence embeddings (deep learning)**

- `all-MiniLM-L6-v2` fine-tuned with `BatchHardTripletLoss` (cosine) on HC3 train sentences, so human and AI sentences separate in embedding space.
- Loaded from `models/embedding_model/` when present (override with `EMBEDDING_MODEL_PATH`), else the stock model.
- Feeds the 3 semantic + 5 document-embedding features and the neural head's chunk embedding.

---

### **4. Neural head (deep learning, `core/neural_head.py`)**

- MLP: [384-d chunk embedding ‖ 25 standardized features] → 128 → 32 → 1 (BatchNorm, ReLU, dropout 0.2).
- Files: `models/neural_head.pt` + `models/neural_head_meta.json`. Only blended when `w_nn > 0`.
- **Currently `w_nn = 0`:** it overfits to topic (99.2% in-domain, 84.3% on held-out domains). Tuning on the in-domain val split gave it 0.40 weight and cut held-out accuracy to 88.9%.

---

### **5. Results (HC3 serving-style chunks, held-out domains = medicine + wiki_csai)**

Weights and threshold are tuned on the val split; the held-out-domain test split (3,000 chunks) is only reported.

| System | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| Before (lr_model.pkl, 0.45 / 0.55, threshold 0.52) | 87.3% | 95.5% | 78.3% | 0.861 | 0.971 |
| **Current (0.90 / 0.10 / 0.00, threshold 0.50)** | **97.0%** | 95.0% | 99.2% | 0.970 | 0.993 |
| With neural head at val-tuned 0.40 | 88.9% | 82.4% | 99.0% | 0.899 | 0.992 |

Component ablations on the held-out domains: document-embedding features add +0.0005 AUC to the feature model (noise); fine-tuning raises a linear probe on chunk embeddings from 0.868 to 0.968 val AUC but leaves the ensemble unchanged. The improvement comes from re-tuning the blend against the models actually served. The earlier "98.3%" figure was measured in-domain and is not comparable.

Retraining: see [ai-service/docs/TRAINING_RUNBOOK.md](../../ai-service/docs/TRAINING_RUNBOOK.md).

---

### **6. Smart Extraction Router**

The system doesn't just read text; it understands the medium:
- **PDF/DOCX**: Direct extraction with fallback to OCR if the document is a flattened image.
- **Images**: Direct Tesseract invocation.
- **Video/Audio**: Piped through FFmpeg to isolate audio, then transcribed using OpenAI's Whisper (Base model).

---

## 📊 Thresholds & Verdicts

The final score is the mean chunk score. With `threshold` from `ensemble_config.json` (currently 0.50):

| Score Range | Verdict | Meaning |
|-------------|---------|---------|
| **< threshold × 0.65** (< 0.325) | `human` | High confidence in human origin. |
| **< threshold** (0.325 – 0.50) | `mixed` | Potential AI assistance or heavily edited text. |
| **≥ threshold** (≥ 0.50) | `ai_generated` | Low probability of human authorship. |

---

## 🔧 Technical Specification

- **Backend**: Python 3.11 with FastAPI (Uvicorn).
- **Inference**: PyTorch (for RoBERTa/GPT-2).
- **Serialization**: Joblib (for Logistic Regression models).
- **NLP Libraries**: `transformers`, `nltk`, `scikit-learn`.
- **Extraction**: `pdfplumber`, `python-docx`, `pytesseract`, `openai-whisper`.

**Performance Note:** Average inference time is ~150-300ms depending on document length and whether OCR/Transcription is required.
