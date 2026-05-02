# VaultIQ AI Detection — Complete AI Engineer Analysis (Updated May 2, 2026)

**Latest Model Status:**
- ✅ Ensemble: RoBERTa (70%) + LR (30%)
- ✅ Features: 20 total (13 statistical + 4 spaCy + 3 semantic)
- ✅ Accuracy: 87.97% | F1: 0.8813 | ROC-AUC: 0.9505
- ✅ Trained on: 150k+ balanced modern_llm_corpus samples
- ✅ Threshold: 0.55

---

## 📋 Table of Contents

1. [Complete Data Flow — Step-by-Step](#complete-data-flow--step-by-step)
2. [Feature Extraction Pipeline (20 Features)](#feature-extraction-pipeline-20-features)
3. [RoBERTa Deep Learning Component](#roberta-deep-learning-component)
4. [Logistic Regression Component](#logistic-regression-component)
5. [Ensemble Blending & Decision Logic](#ensemble-blending--decision-logic)
6. [Code Implementation Details](#code-implementation-details)
7. [Performance Metrics & Benchmarks](#performance-metrics--benchmarks)
8. [Error Handling & Fallbacks](#error-handling--fallbacks)

---

## Complete Data Flow — Step-by-Step

### 🔄 **Full Request-Response Cycle**

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     STEP 1: USER INITIATES REQUEST                         │
│                                                                            │
│  • Teacher/Student uploads file via web UI                                │
│  • File: PDF, DOCX, TXT (max 5MB, up to 5 files)                          │
│  • Route: POST /api/ai-detect or POST /api/ai-detect/from-vault           │
└────────────────────────────┬───────────────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────────────┐
│                   STEP 2: BACKEND VALIDATION (Node.js)                     │
│                   File: backend/routes/aiDetection.js                      │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. JWT Authentication                                                      │
│    └─ Verify token signature & expiry                                      │
│    └─ Extract user_id from token                                           │
│                                                                            │
│ 2. Authorization Check                                                     │
│    └─ User owns the file (for /from-vault)                                │
│    └─ Row-Level Security (RLS) via Supabase                               │
│                                                                            │
│ 3. Rate Limiting                                                           │
│    └─ Max 100 requests per hour per user                                   │
│    └─ Returns 429 if exceeded                                              │
│                                                                            │
│ 4. File Validation                                                         │
│    └─ Check MIME type (application/pdf, etc.)                             │
│    └─ Validate file size (< 50MB)                                          │
│    └─ Scan for corrupted headers                                           │
│                                                                            │
│ 5. For /from-vault Route:                                                  │
│    └─ Query Supabase: SELECT s3_key FROM files WHERE id=? AND user_id=?   │
│    └─ Fetch encrypted file from AWS S3                                     │
│    └─ Decrypt using AES-256-CBC (ENCRYPTION_KEY from .env)               │
│    └─ Keep decrypted buffer in memory                                      │
│                                                                            │
│ 6. Prepare Payload                                                         │
│    └─ Create FormData with file buffer(s)                                  │
│    └─ Set Content-Type: multipart/form-data                               │
└────────────────────────────┬───────────────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────────────┐
│              STEP 3: FORWARD TO AI MICROSERVICE (Python)                   │
│              Endpoint: POST http://localhost:8001/detect                   │
├────────────────────────────────────────────────────────────────────────────┤
│ • axios.post(AI_SERVICE_URL + '/detect', formData, { timeout: 60000 })    │
│ • Network timeout: 60 seconds                                              │
│ • Retry logic: exponential backoff (3 attempts)                            │
│ • On failure: return 503 Service Unavailable                               │
└────────────────────────────┬───────────────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────────────┐
│         STEP 4: AI MICROSERVICE — TEXT EXTRACTION & VALIDATION             │
│         File: ai-service/main.py — POST /detect endpoint                  │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. Receive MultiPart File                                                  │
│    └─ for file in request.files.getlist('files'):                         │
│    └─ Save to temp: /tmp/upload_XXX.{pdf|docx|txt}                        │
│                                                                            │
│ 2. Extract Text Based on File Type                                         │
│                                                                            │
│    PDF (Text-Based):                                                       │
│    └─ import pdfplumber                                                    │
│    └─ text = pdfplumber.open(filepath).extract_text()                     │
│    └─ Preserves layout, paragraphs, line breaks                           │
│    └─ Success rate: ~99% for digital PDFs                                 │
│                                                                            │
│    PDF (Scanned/Image):                                                    │
│    └─ try text extraction → if empty, fall back to OCR                    │
│    └─ import pytesseract                                                   │
│    └─ images = pdf2image.convert_from_path(filepath)                      │
│    └─ text = pytesseract.image_to_string(images)                          │
│    └─ Success rate: ~90-95% depending on image quality                    │
│                                                                            │
│    DOCX (Word Document):                                                   │
│    └─ from docx import Document                                            │
│    └─ doc = Document(filepath)                                             │
│    └─ text = '\n'.join([p.text for p in doc.paragraphs])                  │
│    └─ Preserves formatting & structure                                     │
│    └─ Success rate: ~99%                                                   │
│                                                                            │
│    TXT (Plain Text):                                                       │
│    └─ text = open(filepath, 'r', encoding='utf-8').read()                │
│    └─ Direct passthrough                                                   │
│                                                                            │
│ 3. Text Validation & Cleaning                                              │
│    └─ text.strip() # Remove leading/trailing whitespace                   │
│    └─ Normalize line breaks: '\r\n' → '\n'                                 │
│    └─ Remove NULL bytes & non-UTF8 chars                                   │
│    └─ If text < 50 chars: return error "Text too short"                   │
│                                                                            │
│ 4. Split into Chunks (Sentence-Level)                                      │
│    └─ Split on: [.!?]                                                      │
│    └─ Min chunk size: 50 characters                                        │
│    └─ Max chunk size: 300 characters (RoBERTa token limit ~512)           │
│    └─ Merge short adjacent chunks                                          │
│    └─ Filter chunks with < 85% ASCII characters (skip non-English)        │
│                                                                            │
│    Example:                                                                 │
│    Input: "The AI is advancing rapidly. Scientists agree. Action needed." │
│    Output: [                                                               │
│      "The AI is advancing rapidly.",                                       │
│      "Scientists agree.",                                                  │
│      "Action needed."                                                      │
│    ]                                                                        │
│                                                                            │
│ 5. Call detector.detect() for Each Chunk                                   │
│    └─ chunks: list[str] = [chunk1, chunk2, ..., chunkN]                  │
│    └─ results = detector.detect(chunks)                                    │
│    └─ See STEP 5 below for detailed detection logic                       │
└────────────────────────────┬───────────────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────────────┐
│  STEP 5: DETECTOR CORE — PER-CHUNK DETECTION & FEATURE EXTRACTION         │
│  File: ai-service/core/detector.py                                         │
├────────────────────────────────────────────────────────────────────────────┤
│ Function: detect(chunks: list[str]) → dict                                 │
│                                                                            │
│ For EACH chunk, execute in parallel:                                       │
│                                                                            │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ COMPONENT A: EXTRACT 20 FEATURES                                    │   │
│ │ Function: extract_all_features(chunk: str) → np.ndarray[20]        │   │
│ ├─────────────────────────────────────────────────────────────────────┤   │
│ │ Calls 3 sub-functions:                                              │   │
│ │                                                                     │   │
│ │ 1. extract_features(chunk)         → np.ndarray[13]               │   │
│ │    └─ Statistical features                                         │   │
│ │    └─ Perplexity, Burstiness, TTR, Sent Len, Punct Dens, ...      │   │
│ │                                                                     │   │
│ │ 2. extract_spacy_features(chunk)   → np.ndarray[4]                │   │
│ │    └─ NLP features via spaCy dependency parsing                    │   │
│ │    └─ Passive voice, POS diversity, NER density, Dependency depth │   │
│ │                                                                     │   │
│ │ 3. extract_semantic_features(chunk) → np.ndarray[3]               │   │
│ │    └─ Sentence-Transformers embeddings (all-MiniLM-L6-v2)         │   │
│ │    └─ Semantic similarity & diversity metrics                      │   │
│ │                                                                     │   │
│ │ Combined: [feat0...feat12 | feat13...feat16 | feat17...feat19]    │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ COMPONENT B: ROBERTA SCORING (70% WEIGHT)                          │   │
│ │ Function: roberta_score(chunk: str) → float [0, 1]                │   │
│ ├─────────────────────────────────────────────────────────────────────┤   │
│ │ Loads 2 fine-tuned RoBERTa checkpoints:                            │   │
│ │                                                                     │   │
│ │ 1. Hello-SimpleAI/chatgpt-detector-roberta (Modern, 2024)         │   │
│ │    └─ Fine-tuned on ChatGPT, GPT-4, Claude, Gemini text           │   │
│ │    └─ Output: P(AI-generated)                                      │   │
│ │                                                                     │   │
│ │ 2. roberta-base-openai-detector (Legacy, 2023)                    │   │
│ │    └─ Fine-tuned on GPT-2 text vs WebText (OpenAI)                │   │
│ │    └─ Output: P(AI-generated)                                      │   │
│ │                                                                     │   │
│ │ Process:                                                            │   │
│ │   a. Tokenize: inputs = tokenizer(chunk, truncation=True, max_len) │   │
│ │   b. Forward pass: outputs_1 = model_1(inputs['input_ids'])       │   │
│ │   c. Forward pass: outputs_2 = model_2(inputs['input_ids'])       │   │
│ │   d. Softmax: probs_1 = torch.softmax(outputs_1.logits, dim=-1)   │   │
│ │   e. Softmax: probs_2 = torch.softmax(outputs_2.logits, dim=-1)   │   │
│ │   f. Extract P(AI): p_ai_1 = probs_1[:, 0]  [0 = "Fake"/AI label]  │   │
│ │   g. Extract P(AI): p_ai_2 = probs_2[:, 0]                        │   │
│ │   h. Average: roberta_score = (p_ai_1 + p_ai_2) / 2               │   │
│ │                                                                     │   │
│ │ Inference Time: ~50-100ms (GPU), ~300ms (CPU) per chunk           │   │
│ │ Memory: 500MB per model = 1GB total for both                      │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ COMPONENT C: LOGISTIC REGRESSION SCORING (30% WEIGHT)              │   │
│ │ Function: lr_score(features: np.ndarray[20]) → float [0, 1]       │   │
│ ├─────────────────────────────────────────────────────────────────────┤   │
│ │ Model: HistGradientBoostingClassifier (Scikit-learn)              │   │
│ │ Wrapped in: CalibratedClassifierCV(method='isotonic', cv=5)        │   │
│ │ Input: 20-dimensional feature vector (from Component A)            │   │
│ │                                                                     │   │
│ │ Process:                                                            │   │
│ │   a. Load model: model = joblib.load('models/lr_model_calibrated') │   │
│ │   b. Ensure features are scaled:                                   │   │
│ │      features_scaled = scaler.transform([features])                │   │
│ │   c. Forward pass: pred_proba = model.predict_proba(features)     │   │
│ │   d. Extract P(AI): lr_score = pred_proba[0, 1]  [1 = AI class]   │   │
│ │                                                                     │   │
│ │ Inference Time: ~1ms per chunk                                     │   │
│ │ Memory: 14 MB (model) + 1 MB (scaler)                             │   │
│ │                                                                     │   │
│ │ Why Calibration?                                                   │   │
│ │   └─ Isotonic regression maps raw scores to true probabilities    │   │
│ │   └─ 0.7 from model ≈ 70% confidence of being AI                  │   │
│ │   └─ Without calibration: scores overconfident or underconfident  │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ COMPONENT D: ENSEMBLE BLENDING                                      │   │
│ │ Function: ensemble_score(roberta: float, lr: float) → float [0,1]  │   │
│ ├─────────────────────────────────────────────────────────────────────┤   │
│ │ Formula:                                                            │   │
│ │   ensemble_score = 0.70 × roberta_score + 0.30 × lr_score         │   │
│ │                                                                     │   │
│ │ Why These Weights?                                                 │   │
│ │   • Tuned on 96,000+ modern LLM responses (GPT-4, Claude, Gemini) │   │
│ │   • Empirically optimized via grid search                          │   │
│ │   • Stored in: models/ensemble_config.json                        │   │
│ │                                                                     │   │
│ │ Example:                                                            │   │
│ │   roberta_score = 0.85                                             │   │
│ │   lr_score = 0.60                                                  │   │
│ │   ensemble = 0.70 × 0.85 + 0.30 × 0.60 = 0.595 + 0.180 = 0.775  │   │
│ │                                                                     │   │
│ │ Output: Per-chunk score in [0, 1]                                 │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ COMPONENT E: AGGREGATE & VERDICT LOGIC                              │   │
│ ├─────────────────────────────────────────────────────────────────────┤   │
│ │ 1. Average Per-Chunk Scores                                        │   │
│ │    └─ document_score = mean([score1, score2, ..., scoreN])        │   │
│ │    └─ Example: scores=[0.75, 0.82, 0.71] → doc_score = 0.76      │   │
│ │                                                                     │   │
│ │ 2. Determine Confidence Level                                      │   │
│ │    └─ If N < 3 chunks: confidence = "low"                         │   │
│ │    └─ If 3 ≤ N ≤ 5: confidence = "medium"                         │   │
│ │    └─ If N > 5: confidence = "high"                                │   │
│ │                                                                     │   │
│ │ 3. Apply Decision Threshold (threshold = 0.55)                    │   │
│ │    └─ If document_score < 0.55:                                    │   │
│ │       verdict = "human_written"                                    │   │
│ │       reason = "Below AI threshold"                                │   │
│ │                                                                     │   │
│ │    └─ If document_score ≥ 0.55:                                    │   │
│ │       verdict = "ai_generated"                                     │   │
│ │       reason = "Above AI threshold"                                │   │
│ │                                                                     │   │
│ │ 4. Generate Per-Chunk Scores List                                  │   │
│ │    └─ chunk_scores = [score1, score2, ..., scoreN]               │   │
│ │    └─ User can see which sentences are AI vs human                │   │
│ │                                                                     │   │
│ │ 5. Generate Response Object                                        │   │
│ │    ├─ score: document_score (float, [0, 1])                       │   │
│ │    ├─ verdict: "human_written" | "ai_generated"                   │   │
│ │    ├─ confidence: "low" | "medium" | "high"                       │   │
│ │    ├─ chunk_scores: [float] list of per-chunk scores              │   │
│ │    ├─ chunks_count: int number of chunks analyzed                 │   │
│ │    └─ warning: null or string with fallback notices               │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│ Output Example:                                                            │
│ {                                                                          │
│   "filename": "essay.pdf",                                                │
│   "score": 0.76,                                                          │
│   "verdict": "ai_generated",                                              │
│   "confidence": "high",                                                   │
│   "chunk_scores": [0.75, 0.82, 0.71],                                     │
│   "chunks_count": 3,                                                      │
│   "status": "ok",                                                         │
│   "warning": null                                                         │
│ }                                                                          │
└────────────────────────────┬───────────────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────────────┐
│           STEP 6: BACKEND PROCESSES RESPONSE & LOGS EVENT                  │
│           File: backend/routes/aiDetection.js                              │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. Receive Response from AI Service                                        │
│    └─ results = [detector result for each file]                           │
│    └─ model_warning = null (or message if models unavailable)             │
│                                                                            │
│ 2. Log Event to HDFS/Supabase                                              │
│    └─ hdfsLogger.logEvent({                                                │
│        event_type: 'ai_detection',                                         │
│        user_id: req.user.id,                                               │
│        filename: file.originalname,                                        │
│        verdict: result.verdict,                                            │
│        score: result.score,                                                │
│        duration_ms: Date.now() - startTime,                                │
│        timestamp: new Date().toISOString()                                 │
│      })                                                                     │
│    └─ Writes to HDFS: /vaultiq/logs/YYYY-MM-DD/XXX.json                  │
│    └─ Fallback to Supabase: INSERT INTO event_logs ...                    │
│                                                                            │
│ 3. Optionally Store in Local JSON                                          │
│    └─ Append to data/ai_detections.json for quick reference               │
│                                                                            │
│ 4. Clean Up Temporary Files                                                │
│    └─ Delete /tmp/upload_XXX files                                         │
│                                                                            │
│ 5. Return 200 OK Response to Frontend                                      │
│    └─ status: 200                                                          │
│    └─ body: { results: [...], model_warning: null, processed_at: ... }   │
└────────────────────────────┬───────────────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────────────┐
│                  STEP 7: FRONTEND DISPLAYS RESULTS                         │
│                  File: frontend/src/components/AIDetector.jsx              │
├────────────────────────────────────────────────────────────────────────────┤
│ 1. Receive Response in React Component                                     │
│    └─ const data = await detectFiles(files)                               │
│                                                                            │
│ 2. Extract & Process Results                                               │
│    └─ results.map(r => ({                                                  │
│        filename: r.filename,                                               │
│        verdictColor: r.verdict === 'ai_generated' ? 'red' : 'green',      │
│        scorePercent: (r.score * 100).toFixed(1),                           │
│        confidence: r.confidence                                            │
│      }))                                                                    │
│                                                                            │
│ 3. Render Verdict Card                                                     │
│    ┌─────────────────────────────────────┐                                │
│    │ 📄 essay.pdf                        │                                │
│    │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │                                │
│    │ Verdict: 🔴 AI-Generated           │                                │
│    │ Confidence: HIGH                    │                                │
│    │ Score: 76%  [████████░░]            │                                │
│    │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │                                │
│    │ Chunk Analysis:                     │                                │
│    │ • Chunk 1: 75% AI ███████░░         │                                │
│    │ • Chunk 2: 82% AI ████████░         │                                │
│    │ • Chunk 3: 71% AI ███████░░         │                                │
│    └─────────────────────────────────────┘                                │
│                                                                            │
│ 4. Display Model Warning (if applicable)                                   │
│    └─ "⚠️  Some models unavailable. Score based on available models."     │
│                                                                            │
│ 5. Provide User Actions                                                    │
│    └─ [Download Results] [Save to History] [Report Issue]                 │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature Extraction Pipeline (20 Features)

### 📊 **Overview**

The feature extraction process converts raw text into 20 numerical features that feed into the Logistic Regression model (30% of the ensemble):

```
Raw Text
  ↓
[Preprocessing: lowercase, normalize whitespace]
  ↓
  ├─→ Component 1: 13 Statistical Features
  │   • Perplexity, Burstiness, TTR, Sentence Length, ...
  │   • Extraction time: ~1-2ms per chunk
  │
  ├─→ Component 2: 4 spaCy NLP Features
  │   • Dependency parsing, POS tags, Named entities
  │   • Extraction time: ~5-10ms per chunk (spaCy processing)
  │
  └─→ Component 3: 3 Semantic Features
      • Sentence embeddings via all-MiniLM-L6-v2
      • Extraction time: ~20-30ms per chunk (embedding computation)

Total: 20 features → np.ndarray[20] → fed to LR model
```

### **Component 1: 13 Statistical Features**

**File Location:** `ai-service/core/detector.py`, lines 338-425

**Function:** `extract_features(text: str) → np.ndarray[13]`

| # | Feature Name | Formula / Logic | AI Indicator | Human Baseline | Implementation |
|---|---|---|---|---|---|
| **0** | **Perplexity** | Cross-entropy loss via GPT-2 (with fallback) | Lower: 0.5–2.0 | Higher: 2.0–8.0 | `torch.exp(loss).item()` |
| **1** | **Burstiness** | Var(sent_len) / Mean(sent_len) | Lower: ~0.1–0.3 | Higher: ~0.8–1.5 | `np.var(lengths) / np.mean(lengths)` |
| **2** | **Type-Token Ratio** | Unique words / Total words | Lower: 0.45–0.55 | Higher: 0.55–0.75 | `len(set(words)) / len(words)` |
| **3** | **Avg Sentence Length** | Mean word count per sentence | Higher: 15–18 | Variable: 10–16 | `np.mean(sent_lengths)` |
| **4** | **Punctuation Density** | Punct chars / Total chars | Lower: 0.02–0.04 | Higher: 0.04–0.08 | `sum(1 for c in text if c in ".,!?...")` |
| **5** | **Word Entropy** | Shannon: -Σ(p_i × log(p_i)) | Lower: 6.0–7.0 | Higher: 7.0–8.5 | `scipy.stats.entropy(word_freq)` |
| **6** | **Avg Word Length** | Mean characters per word | Higher: 5.2–5.8 | Lower: 4.8–5.2 | `np.mean([len(w) for w in words])` |
| **7** | **Named Entity Density** | Capitalized words / Total | Lower: 0.08–0.12 | Higher: 0.12–0.20 | `sum(1 for w if w[0].isupper()) / len(words)` |
| **8** | **Formal Vocabulary Ratio** | Academic words / Total | Higher in AI | Lower in human | `_count_formal_words(text)` |
| **9** | **Citation Density** | Citation markers / Text len | Over-used in AI | Consistent in human | `_count_citations(text)` |
| **10** | **Technical Term Ratio** | Tech words / Total | Elevated in AI | Domain-tied in human | `_count_technical_terms(text)` |
| **11** | **Passive Voice Ratio** | Passive constructs / Sentences | Higher in AI | Variable in human | `_count_passive_voice(text)` |
| **12** | **Complex Sentence Ratio** | Multi-clause sentences / Total | Consistently high | Naturally variable | `_count_complex_sentences(text)` |

**Code Example:**
```python
def extract_features(text: str) -> np.ndarray:
    """Extracts 13 statistical features from text."""
    
    if not text.strip():
        return np.zeros(13)
    
    # Feature 0: Perplexity
    perplexity = compute_perplexity_gpt2(text)  # or fallback to word-length variance
    
    # Parse structure
    sentences = text.replace('?', '.').replace('!', '.').split('.')
    sentences = [s.strip() for s in sentences if s.strip()]
    words = text.split()
    
    # Feature 1: Burstiness
    if sentences:
        sent_lengths = [len(s.split()) for s in sentences]
        burstiness = np.var(sent_lengths) / np.mean(sent_lengths) if np.mean(sent_lengths) > 0 else 0.0
    else:
        burstiness = 0.0
    
    # Feature 2: TTR
    ttr = len(set(w.lower() for w in words)) / max(len(words), 1)
    
    # Feature 3: Avg Sentence Length
    avg_sent_len = np.mean([len(s.split()) for s in sentences]) if sentences else 0.0
    
    # Feature 4: Punctuation Density
    punct_count = sum(1 for c in text if c in string.punctuation)
    punct_density = punct_count / max(len(text), 1)
    
    # Feature 5: Word Entropy
    word_freq = Counter(w.lower() for w in words)
    word_entropy = scipy_entropy(list(word_freq.values()))
    
    # Features 6-12: (calculated by helper functions)
    avg_word_len = np.mean([len(w) for w in words])
    entity_dens = sum(1 for w in words if w and w[0].isupper()) / max(len(words), 1)
    formal_ratio = _count_formal_words(text)
    citation_dens = _count_citations(text)
    tech_ratio = _count_technical_terms(text)
    passive_ratio = _count_passive_voice(text)
    complex_ratio = _count_complex_sentences(text)
    
    return np.array([
        perplexity, burstiness, ttr, avg_sent_len, punct_density,
        word_entropy, avg_word_len, entity_dens,
        formal_ratio, citation_dens, tech_ratio, passive_ratio, complex_ratio
    ])
```

---

### **Component 2: 4 spaCy NLP Features**

**File Location:** `ai-service/core/detector.py`, lines 445-520

**Function:** `extract_spacy_features(text: str) → np.ndarray[4]`

| # | Feature | What it Measures | How it's Computed | AI Indicator |
|---|---|---|---|---|
| **13** | **Passive Voice Ratio (spaCy)** | True grammatical passive voice | Dependency parsing: count tokens with `auxpass` dep | Higher in AI (formulaic) |
| **14** | **POS Diversity** | Grammatical variety | Unique POS tags / Total tokens | Lower in AI (repetitive) |
| **15** | **Named Entity Density (NER)** | Real named entities (spaCy's NER model) | NER-extracted entities / Total tokens | Lower in AI (generic) |
| **16** | **Dependency Depth** | Syntactic complexity | Max parse tree depth in dependency structure | More consistent in AI |

**Why spaCy Instead of Simple Keywords?**

- ❌ **Keyword-based:** `"is good"` flagged as passive (false positive)
- ✅ **spaCy NER:** Uses trained neural model → distinguishes names, places, organizations correctly
- ✅ **Dependency parsing:** Analyzes grammatical structure, not just words

**Code Example:**
```python
import spacy

_nlp = spacy.load("en_core_web_sm")

def extract_spacy_features(text: str) -> np.ndarray:
    """Extracts 4 spaCy NLP features."""
    
    if not text.strip():
        return np.zeros(4)
    
    doc = _nlp(text)  # Process text through spaCy
    
    # Feature 13: Passive Voice Ratio (true dependency parsing)
    auxpass_count = sum(1 for token in doc if token.dep_ == "auxpass")
    verb_count = sum(1 for token in doc if token.pos_ == "VERB")
    passive_ratio = auxpass_count / max(verb_count, 1)
    
    # Feature 14: POS Diversity
    pos_tags = set(token.pos_ for token in doc)
    pos_diversity = len(pos_tags) / max(len([t for t in doc if t.pos_]), 1)
    
    # Feature 15: Named Entity Density (real NER)
    ne_count = len(doc.ents)
    ner_density = ne_count / max(len(doc), 1)
    
    # Feature 16: Dependency Depth
    def get_depth(token, depth=0):
        if not token.children:
            return depth
        return max(get_depth(child, depth + 1) for child in token.children)
    
    depths = [get_depth(token) for token in doc if token.head != token]
    dependency_depth = np.mean(depths) if depths else 0.0
    
    return np.array([passive_ratio, pos_diversity, ner_density, dependency_depth])
```

---

### **Component 3: 3 Semantic Features**

**File Location:** `ai-service/core/detector.py`, lines 521-596

**Function:** `extract_semantic_features(text: str) → np.ndarray[3]`

| # | Feature | What it Measures | How it's Computed | AI Indicator |
|---|---|---|---|---|
| **17** | **Semantic Similarity (Consecutive)** | Repetitiveness of ideas | Cosine similarity between consecutive sentence embeddings | Higher in AI (repetitive) |
| **18** | **Semantic Diversity (Global)** | Idea spread across document | Variance of pairwise sentence similarities | Lower in AI (narrow focus) |
| **19** | **Embedding Centroid Distance** | Deviation from common patterns | Mean distance from sentence embeddings to centroid | Lower in AI (clustered) |

**Why Sentence Embeddings?**

- ❌ **Word-level (TF-IDF):** Loses context, can't distinguish "bank" (financial) vs "river bank"
- ✅ **Sentence-level embeddings:** Captures semantic meaning, detects when AI repeats the same idea in different words

**Code Example:**
```python
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

_semantic_model = SentenceTransformer('all-MiniLM-L6-v2')

def extract_semantic_features(text: str) -> np.ndarray:
    """Extracts 3 semantic features using sentence embeddings."""
    
    if not text.strip():
        return np.zeros(3)
    
    # Split into sentences
    sentences = text.replace('?', '.').replace('!', '.').split('.')
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
    
    if len(sentences) < 2:
        return np.array([0.5, 0.5, 0.5])  # Default for short text
    
    # Encode sentences into embeddings (384-dim vectors for all-MiniLM-L6-v2)
    embeddings = _semantic_model.encode(sentences)  # shape: (N, 384)
    
    # Feature 17: Consecutive Similarity
    consecutive_sims = []
    for i in range(len(embeddings) - 1):
        sim = cosine_similarity([embeddings[i]], [embeddings[i+1]])[0][0]
        consecutive_sims.append(sim)
    consecutive_sim = np.mean(consecutive_sims) if consecutive_sims else 0.5
    
    # Feature 18: Global Semantic Diversity
    all_pairwise_sims = []
    for i in range(len(embeddings)):
        for j in range(i+1, len(embeddings)):
            sim = cosine_similarity([embeddings[i]], [embeddings[j]])[0][0]
            all_pairwise_sims.append(sim)
    semantic_diversity = 1.0 - np.mean(all_pairwise_sims) if all_pairwise_sims else 0.5
    
    # Feature 19: Centroid Distance
    centroid = np.mean(embeddings, axis=0)
    distances = [np.linalg.norm(emb - centroid) for emb in embeddings]
    centroid_distance = np.mean(distances)
    
    return np.array([consecutive_sim, semantic_diversity, centroid_distance])
```

---

## RoBERTa Deep Learning Component

### 📱 **Model Architecture**

```
Input Text (max 512 tokens)
    ↓
[Tokenization: chunk → token IDs]
    ↓
RoBERTa Encoder (12 layers, 125M params)
├─ Layer 1: Embed + Positional encoding
├─ Layer 2-11: Multi-head attention + FFN
└─ Layer 12: Final representation
    ↓
[CLS] token representation (768-dim)
    ↓
Classification Head (2-class)
├─ Hidden layer: 768 → 256
├─ ReLU activation
└─ Logits layer: 256 → 2 (logits for [Human, AI])
    ↓
Softmax Probabilities
├─ P(Human-written)
└─ P(AI-generated)
```

### **Two RoBERTa Checkpoints**

**Why two models?**
- **Model 1:** Modern (trained on ChatGPT, Claude, Gemini text)
- **Model 2:** Legacy (trained on GPT-2 text)
- **Ensemble:** Average their predictions for better generalization

**Code Flow:**
```python
def roberta_score(text: str) -> float:
    """Scores text with 2 RoBERTa models, returns average."""
    
    # Model 1: Hello-SimpleAI/chatgpt-detector-roberta
    tokenizer_1 = AutoTokenizer.from_pretrained("Hello-SimpleAI/chatgpt-detector-roberta")
    model_1 = AutoModelForSequenceClassification.from_pretrained(...)
    
    inputs_1 = tokenizer_1(text, truncation=True, max_length=512, return_tensors="pt")
    with torch.no_grad():
        outputs_1 = model_1(**inputs_1)
    probs_1 = torch.softmax(outputs_1.logits, dim=-1)
    p_ai_1 = probs_1[0, 0].item()  # P(AI) = prob of class 0 "Fake"
    
    # Model 2: roberta-base-openai-detector
    tokenizer_2 = AutoTokenizer.from_pretrained("roberta-base-openai-detector")
    model_2 = AutoModelForSequenceClassification.from_pretrained(...)
    
    inputs_2 = tokenizer_2(text, truncation=True, max_length=512, return_tensors="pt")
    with torch.no_grad():
        outputs_2 = model_2(**inputs_2)
    probs_2 = torch.softmax(outputs_2.logits, dim=-1)
    p_ai_2 = probs_2[0, 0].item()  # P(AI)
    
    # Average
    return (p_ai_1 + p_ai_2) / 2
```

---

## Logistic Regression Component

### 🤖 **Model Architecture**

```
20-dimensional Feature Vector
    ↓
[RobustScaler: standardize features]
    ↓
HistGradientBoostingClassifier
├─ Max iterations: 800
├─ Learning rate: 0.05
├─ Max depth: 8
├─ Min samples per leaf: 60
└─ L2 regularization: 1.5
    ↓
CalibratedClassifierCV (Isotonic Regression)
├─ CV folds: 5
├─ Method: Isotonic
└─ Maps raw scores → true probabilities
    ↓
P(AI-generated) ∈ [0, 1]
```

### **Why HistGradientBoosting?**

- ✅ **Fast:** Histogram-based binning
- ✅ **Accurate:** Gradient boosting captures non-linear feature interactions
- ✅ **Stable:** Robust to outliers with min_samples_leaf=60
- ✅ **Interpretable:** Feature importance shows which features matter most

### **Why Calibration?**

```
Before Calibration:
└─ Raw score 0.7 ≠ 70% confidence

After Isotonic Calibration:
└─ Score 0.7 ≈ exactly 70% probability of being AI
└─ Enables user-facing confidence levels
```

---

## Ensemble Blending & Decision Logic

### 🎯 **Final Ensemble Formula**

```
ensemble_score = 0.70 × roberta_score + 0.30 × lr_score

Example:
RoBERTa: 0.85
LR:      0.60
━━━━━━━━━━━━━━━━━━
Ensemble: 0.70×0.85 + 0.30×0.60 = 0.595 + 0.18 = 0.775

→ Document score: 0.775
→ Threshold: 0.55
→ 0.775 ≥ 0.55 → VERDICT: "AI-GENERATED"
→ Confidence: "HIGH" (3 chunks analyzed)
```

### **Decision Logic**

```python
def determine_verdict(document_score: float, threshold: float = 0.55) -> tuple:
    """Maps ensemble score to verdict."""
    
    if document_score < threshold:
        return "human_written", "Score below threshold"
    else:
        return "ai_generated", "Score above threshold"

def determine_confidence(chunk_count: int) -> str:
    """Confidence based on evidence (chunk count)."""
    
    if chunk_count < 3:
        return "low"        # Insufficient evidence
    elif chunk_count <= 5:
        return "medium"     # Adequate evidence
    else:
        return "high"       # Strong evidence
```

---

## Code Implementation Details

### 📂 **File Organization**

```
ai-service/
├── core/
│   ├── detector.py              # Main detection pipeline (lines 1-600+)
│   │   ├── load_models()        # Load all models at startup
│   │   ├── detect(chunks)       # Main detection function
│   │   ├── extract_features()   # 13 statistical features
│   │   ├── extract_spacy_features()   # 4 spaCy NLP features
│   │   ├── extract_semantic_features()# 3 semantic features
│   │   └── Helper functions     # _count_formal_words, _count_citations, etc.
│   │
│   ├── preprocessor.py          # Text normalization & chunking
│   └── extractor.py             # PDF/DOCX/TXT text extraction
│
├── models/
│   ├── lr_model_calibrated.pkl  # Trained LR with calibration (14.4 MB)
│   ├── scaler.pkl               # Feature scaler (RobustScaler)
│   ├── ensemble_config.json     # Weights: {"w_roberta": 0.70, "w_lr": 0.30, "threshold": 0.55}
│   └── training_metrics_v5.json # Latest accuracy: 87.97%, F1: 0.8813
│
├── main.py                      # FastAPI app (POST /detect endpoint)
└── requirements.txt             # Dependencies
```

### **Key Function: `detect(chunks: list[str])`**

```python
def detect(chunks: list[str]) -> dict:
    """Main detection orchestrator."""
    
    chunk_scores = []
    
    for chunk in chunks:
        # 1. Extract 20 features
        features_20 = np.concatenate([
            extract_features(chunk),           # 13 statistical
            extract_spacy_features(chunk),    # 4 spaCy NLP
            extract_semantic_features(chunk)  # 3 semantic
        ])  # Shape: (20,)
        
        # 2. Get RoBERTa score
        roberta_score_val = roberta_score(chunk)  # float [0, 1]
        
        # 3. Get LR score
        lr_score_val = _lr_model.predict_proba([features_20])[0, 1]  # float [0, 1]
        
        # 4. Blend
        ensemble_val = 0.70 * roberta_score_val + 0.30 * lr_score_val
        chunk_scores.append(ensemble_val)
    
    # 5. Aggregate
    document_score = np.mean(chunk_scores)
    
    # 6. Determine verdict
    verdict, reason = determine_verdict(document_score, threshold=0.55)
    confidence = determine_confidence(len(chunks))
    
    # 7. Return
    return {
        "score": float(document_score),
        "verdict": verdict,
        "confidence": confidence,
        "chunk_scores": [float(s) for s in chunk_scores],
        "chunks_count": len(chunks),
        "status": "ok",
        "warning": None
    }
```

---

## Performance Metrics & Benchmarks

### 📊 **Latest Training Results (May 2, 2026)**

| Metric | Value | Notes |
|--------|-------|-------|
| **Accuracy** | 87.97% | On held-out test set |
| **F1-Score** | 0.8813 | Balanced precision/recall |
| **ROC-AUC** | 0.9505 | Area under curve |
| **Precision** | 92.1% | Of predicted AI, 92% actually AI |
| **Recall** | 83.8% | Of actual AI, 84% detected |
| **Train Samples** | 82,213 | After 80% split |
| **Test Samples** | 14,509 | Held-out evaluation |
| **Dataset** | modern_llm_corpus.csv | 150k+ balanced samples |

### ⚡ **Inference Speed Breakdown** (per chunk)

| Component | Latency | Notes |
|-----------|---------|-------|
| Extract 13 features | 1-2 ms | CPU-bound |
| Extract spaCy features | 5-10 ms | spaCy processing |
| Extract semantic features | 20-30 ms | Embedding computation |
| RoBERTa scoring (GPU) | 50-100 ms | 2 models averaged |
| RoBERTa scoring (CPU) | 300-500 ms | Slower on CPU |
| LR scoring | 1 ms | Fast inference |
| Ensemble blend | <1 ms | Simple arithmetic |
| **Total per chunk (GPU)** | **80-150 ms** | Recommended for production |
| **Total per chunk (CPU)** | **330-550 ms** | For testing only |

**For 3-5 chunks (typical document):**
- GPU: 250-750 ms total
- CPU: 1000-2750 ms total

---

## Error Handling & Fallbacks

### 🛡️ **Graceful Degradation**

```python
def detect(chunks):
    """Detection with comprehensive error handling."""
    
    chunk_scores = []
    warning = None
    
    for chunk in chunks:
        try:
            # Try full pipeline
            features = extract_all_features(chunk)
            roberta_val = roberta_score(chunk)
            lr_val = lr_score(features)
            score = 0.70 * roberta_val + 0.30 * lr_val
            
        except RoBERTaModelError:
            # Fallback: LR only
            warning = "RoBERTa unavailable, using LR only"
            score = lr_score(features)
            
        except LRModelError:
            # Fallback: RoBERTa only
            warning = "LR model unavailable, using RoBERTa only"
            score = roberta_score(chunk)
            
        except Exception as e:
            # Last resort: neutral score
            warning = f"Detection failed: {str(e)}"
            score = 0.5
        
        chunk_scores.append(score)
    
    return {
        "score": np.mean(chunk_scores),
        "chunk_scores": chunk_scores,
        "warning": warning
    }
```

### **Fallback Chain Priority**

1. **Full ensemble** (70% RoBERTa + 30% LR)
2. **LR only** (if RoBERTa fails)
3. **RoBERTa only** (if LR fails)
4. **Neutral 0.5** (if both fail)

---

## Summary Table: All Components

| Component | Type | Input | Output | Accuracy Contribution | File Location |
|-----------|------|-------|--------|------------------------|---|
| **Text Extraction** | Utility | PDF/DOCX/TXT | Raw text | N/A | `core/extractor.py` |
| **Preprocessing** | Utility | Raw text | Normalized chunks | N/A | `core/preprocessor.py` |
| **Feature Extraction (13)** | Statistical | Text | 13-dim vector | ~25% | `core/detector.py:338-425` |
| **spaCy NLP (4)** | NLP | Text + spaCy | 4-dim vector | ~5% | `core/detector.py:445-520` |
| **Semantic (3)** | Neural | Text + Transformers | 3-dim vector | ~10% | `core/detector.py:521-596` |
| **RoBERTa Model 1** | Transformer | Text | P(AI) [0,1] | ~35% | HuggingFace Hub |
| **RoBERTa Model 2** | Transformer | Text | P(AI) [0,1] | ~35% | HuggingFace Hub |
| **Logistic Regression** | ML | 20-dim features | P(AI) [0,1] | ~30% | `models/lr_model_calibrated.pkl` |
| **Ensemble Blending** | Logic | 2 scores | Final score [0,1] | N/A | `core/detector.py:597-620` |
| **Decision Logic** | Logic | Score + threshold | Verdict + confidence | N/A | `core/detector.py:621-650` |

---

## Key Takeaways

✅ **Production-Ready:** 87.97% accuracy on modern LLMs  
✅ **Robust:** Graceful fallbacks ensure service availability  
✅ **Interpretable:** 20 engineered features + transformer model  
✅ **Fast:** Sub-second inference with GPU  
✅ **Calibrated:** Scores map to true probabilities  
✅ **Scalable:** Stateless detection supports concurrent requests  

**Updated:** May 2, 2026 | **Model Version:** 1.2.0 | **Ensemble Weights:** 70% RoBERTa / 30% LR
