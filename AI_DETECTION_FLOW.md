# 🤖 VaultIQ AI Detection Pipeline — Complete Flow & Architecture (Updated 2026-04-09)

## 📋 Overview

The VaultIQ AI detection battery utilizes a **hybrid ensemble architecture** that cross-evaluates semantic signals against structural and statistical text indicators.

The system combines:
1. **RoBERTa Classifier** (Deep Learning)
2. **Logistic Regression** (Statistical Features)
3. **GPT-2** (Perplexity Analysis)
4. **Multimodal Extraction** (PDF/DOCX/OCR/Video-to-Text)

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
    └─ Sentence tokenization into overlapping chunks
    ↓
[3. FEATURE EXTRACTION] ─────┬─────────────────────────────────┐
    ├─ Perplexity (GPT-2)     │ [4A. ROBERTA CLASSIFICATION]   │
    ├─ Burstiness            │ - Contextual understanding      │
    ├─ Type-Token Ratio      │ - Deep semantic analysis        │
    ├─ Avg Sentence Length   │ - Trained on OpenAI Detector    │
    └─ Punctuation Density   │                                 │
    ↓                         │                                 │
[4B. STATISTICAL SCORING]     │                                 │
    ├─ Logistic Regression   │                                 │
    │  (5-feature vector)    │                                 │
    │  → LR Probability      │                                 │
    └────────────────────────┴─────────────────────────────────┘
    ↓
[5. ENSEMBLE FUSION]
    ├─ Weighted Aggregation: 0.7 * RoBERTa + 0.3 * LR
    ├─ Score normalization (0.0 to 1.0)
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

### **1. RoBERTa Classifier (`roberta-base-openai-detector`)**

**What it does:**
- High-level semantic analysis of the document context.
- Trained by OpenAI specifically to distinguish between GPT-generated and human-written text.
- Captures subtle linguistic patterns that traditional statistical methods miss.

**Weight:** 70% (Primary Signal)

---

### **2. Logistic Regression (Statistical features)**

**What it does:**
- Analyzes 5 key linguistic indicators to catch "robotic" structural patterns typical of LLMs.

**The 5 Features:**

| Feature | What It Detects |
|---------|-----------------|
| **Perplexity** | Measures how "surprised" GPT-2 is by the text. LLMs produce highly predictable (low perplexity) text. |
| **Burstiness** | Sentence length variance. Human writing varies significantly; AI tends to be uniform. |
| **TTR (Type-Token Ratio)** | Vocabulary richness. Measures the ratio of unique words to total words. |
| **Avg Sentence Length** | Measures length consistency. |
| **Punctuation Density** | Captures over-use or perfectly uniform use of punctuation. |

**Weight:** 30% (Auxiliary Signal)
**Fallback:** Uses a trained `lr_model.pkl` located in the `models/` directory.

---

### **3. Smart Extraction Router**

The system doesn't just read text; it understands the medium:
- **PDF/DOCX**: Direct extraction with fallback to OCR if the document is a flattened image.
- **Images**: Direct Tesseract invocation.
- **Video/Audio**: Piped through FFmpeg to isolate audio, then transcribed using OpenAI's Whisper (Base model).

---

## 📊 Thresholds & Verdicts

The final score represents the probability that the text is AI-generated:

| Score Range | Verdict | Meaning |
|-------------|---------|---------|
| **0.0 - 0.40** | `human` | High confidence in human origin. |
| **0.41 - 0.70** | `mixed` | Potential AI assistance or heavily edited text. |
| **0.71 - 1.00** | `ai_generated` | Low probability of human authorship. |

---

## 🔧 Technical Specification

- **Backend**: Python 3.11 with FastAPI (Uvicorn).
- **Inference**: PyTorch (for RoBERTa/GPT-2).
- **Serialization**: Joblib (for Logistic Regression models).
- **NLP Libraries**: `transformers`, `nltk`, `scikit-learn`.
- **Extraction**: `pdfplumber`, `python-docx`, `pytesseract`, `openai-whisper`.

**Performance Note:** Average inference time is ~150-300ms depending on document length and whether OCR/Transcription is required.
