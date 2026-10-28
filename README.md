# VaultIQ

**Secure Document Management with Microsoft Forms-Style Public Submissions & AI-Powered Intelligence**

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://python.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Apache Spark](https://img.shields.io/badge/Apache%20Spark-3.x-E25A1C?logo=apachespark&logoColor=white)](https://spark.apache.org/)
[![AWS S3](https://img.shields.io/badge/AWS%20S3-Cloud%20Storage-FF9900?logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

---

## What is VaultIQ?

VaultIQ is a full-stack education platform combining secure file storage, Microsoft Forms-style public submissions, and AI-powered content intelligence.

**Core Features:**

1. **Public Assignment Collections** — Teachers create collections with custom fields (name, email, student ID, dropdown options, etc.). Students submit via shareable `/submit/:code` links — no login required. Teachers review submissions, download files, and view responses.
2. **Security** — Every file encrypted with AES-256-CBC before leaving the browser; SHA-256 integrity verification on download.
3. **AI Content Detection** — Hybrid ensemble of two RoBERTa detectors (90% weight) and a calibrated classifier over 25 engineered features (statistical + spaCy + fine-tuned MiniLM embedding features), with an optional neural head. Configurable via `ensemble_config.json`. (On HC3 domains held out from training: accuracy 97.0%, ROC-AUC 0.993)
4. **Analytics** — Apache Spark batch jobs produce 6 analytics categories from HDFS event logs (daily activity, anomalies, AI usage, storage, latency, user behaviour).

---

## Table of Contents

- [Quick Start](#quick-start)
- [System Architecture](#system-architecture)
- [Public Submission Flow](#public-submission-flow)
- [Tech Stack](#tech-stack)
- [Setup & Running](#setup--running)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### 5-Minute Local Test

```bash
# 1. Clone and install
git clone <repo> && cd vaultiq
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# 2. Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env with Supabase + AWS credentials

# 3. Run all services
./start.sh
```

Then visit:
- **Teacher Dashboard:** http://localhost:3000/login
- **Student Submit Form:** http://localhost:3000/submit/{shareCode}

### First Use

1. **Create a Collection**
   - Log in as teacher
   - Go to Collections → + New Collection
   - Define custom fields (e.g., "Roll Number", "Topic Choice")
   - Set max file size, allowed types, deadline
   - Copy the `/submit/...` link

2. **Share with Students**
   - Give students the public link (no login needed)
   - They fill form, upload files, submit
   - You review on Dashboard → see email, responses, download files

3. **Enable AI Detection** (optional)
   - Toggle "Auto-detect AI in submissions" when creating collection
   - Start FastAPI service: `uvicorn ai-service/main.py --port 8001`
   - Submissions automatically scanned for AI content

---

## Public Submission Flow

When you create a collection with a shareable link, students access it via the public form **without logging in**:

```
Teacher (Authenticated)
├─ Creates collection with custom fields
├─ Gets `/submit/abc123def456` link
└─ Shares link via email/messaging

Student (Public, No Auth)
├─ Visits http://localhost:3000/submit/abc123def456
├─ Sees form: Name, Email, custom fields, file upload
├─ Drag-drops files (type + size validated client-side)
├─ Submits
└─ Sees success screen

Teacher (Authenticated)
├─ Views all submissions
├─ Downloads files (signed S3 URLs)
├─ Sees student email + custom field responses
├─ Reviews AI detection results (if enabled)
└─ Exports to CSV
```

**Public Routes (no auth required):**
- `GET /api/share/:shareCode` — fetch collection schema
- `POST /api/share/:shareCode/submit` — submit assignment

**Teacher Routes (auth required):**
- `POST /api/collections` — create collection with fields
- `GET /api/collections` — list your collections + submission counts
- `GET /api/collections/:id/submissions` — download files, see responses

---

## System Architecture

VaultIQ is composed of four independently deployable services that communicate over HTTP/REST.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User Browser                               │
│                     React 19 SPA (port 3000)                        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTPS / REST + JWT Cookie
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Node.js / Express 5 Backend                      │
│                         (port 5000)                                 │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  /auth   │  │  /files  │  │  /ai-detect  │  │  /analytics   │  │
│  └──────────┘  └────┬─────┘  └──────┬───────┘  └───────┬───────┘  │
└───────────────────── │ ─────────────│──────────────────│───────────┘
                       │             │                   │
          ┌────────────┼─────────────┘                   │
          │            │                                 │
          ▼            ▼                                 ▼
    ┌──────────┐  ┌──────────────────┐          ┌───────────────┐
    │  AWS S3  │  │  FastAPI AI Svc  │          │  Apache HDFS  │
    │ (files)  │  │   (port 8001)    │          │  (event logs) │
    └──────────┘  └──────────────────┘          └───────┬───────┘
                                                        │
                  ┌─────────────────────────────────────┤
                  │           Supabase (PostgreSQL)      │
                  │  metadata · auth · fallback logs ◄───┘
                  └──────────────────────────────────────
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  Apache Spark   │
                                               │  Batch Jobs     │
                                               │  (6 analytics)  │
                                               └─────────────────┘
```

---

## End-to-End Project Flow

This diagram shows how all four layers — Frontend, Backend, AI Service, and Big Data — work together for every major user action.

```mermaid
flowchart TD
    subgraph Browser["Browser (React 19 SPA)"]
        UI["User Action<br/>(upload / scan / view analytics)"]
    end

    subgraph Backend["Backend (Node.js / Express 5 — port 5000)"]
        Auth["JWT Auth Middleware<br/>HttpOnly cookie"]
        FileRoute["/api/files<br/>encrypt + store"]
        AIRoute["/api/ai-detect<br/>forward to AI service"]
        AnalyticsRoute["/api/analytics<br/>3-tier data read"]
    end

    subgraph Storage["Cloud Storage"]
        S3["AWS S3<br/>AES-256 encrypted objects"]
        DB["Supabase PostgreSQL<br/>file metadata + auth + RLS"]
    end

    subgraph AIService["AI Service (Python FastAPI — port 8001)"]
        Extract["Text Extractor<br/>PDF / DOCX / OCR"]
        Chunk["Chunker<br/>sentence-level"]
        Features["Feature Extraction<br/>13 statistical + 4 spaCy + 3 semantic<br/>= 20 features total"]
        StatModel["Logistic Regression<br/>HistGradientBoosting Classifier<br/>with Platt scaling<br/>— 30% weight"]
        RoBERTa["RoBERTa Classifier<br/>two checkpoints<br/>— 90% weight"]
        Ensemble["Weighted Ensemble<br/>0.70·RoBERTa + 0.30·LR<br/>score + verdict + confidence"]
    end

    subgraph BigData["Big Data Pipeline"]
        HDFS["Apache HDFS<br/>event log storage"]
        Spark["Apache Spark<br/>batch analytics job"]
        Results["analytics_latest.json<br/>6 analytics categories"]
    end

    UI -->|"HTTPS + JWT cookie"| Auth
    Auth --> FileRoute
    Auth --> AIRoute
    Auth --> AnalyticsRoute

    FileRoute -->|"PutObject (ciphertext)"| S3
    FileRoute -->|"INSERT file record"| DB

    AIRoute --> Extract
    Extract --> Chunk
    Chunk --> StatModel
    Chunk --> RoBERTa
    StatModel --> Ensemble
    RoBERTa --> Ensemble
    Ensemble -->|"score, verdict, confidence"| AIRoute

    FileRoute -->|"logEvent (WebHDFS)"| HDFS
    AIRoute -->|"logEvent (WebHDFS)"| HDFS

    HDFS --> Spark
    Spark --> Results
    Results --> AnalyticsRoute
    Results -->|"archive"| S3

    AnalyticsRoute -->|"normalised payload"| UI
```

### File Upload — Detailed Sequence

```mermaid
sequenceDiagram
    participant U as Browser
    participant B as Backend (Node.js)
    participant S3 as AWS S3
    participant DB as Supabase DB
    participant HDFS as Apache HDFS

    U->>B: POST /api/files/upload (multipart, JWT cookie)
    B->>B: Verify JWT signature and expiry
    B->>B: AES-256-CBC encrypt file (random 16-byte IV)
    B->>B: SHA-256 hash of ciphertext
    B->>S3: PutObject — userId/fileId key
    S3-->>B: ETag confirmation
    B->>DB: INSERT file record (s3_key, sha256_hash, mime_type, user_id)
    DB-->>B: file row id
    B->>HDFS: logEvent(file_upload, user_id, size, duration_ms)
    B-->>U: 201 { file_id, name, size, uploaded_at }
```

### AI Detection — Detailed Sequence

```mermaid
sequenceDiagram
    participant U as Browser
    participant B as Backend (Node.js)
    participant AI as AI Service (FastAPI)

    U->>B: POST /api/ai-detect (multipart files, JWT cookie)
    B->>B: Verify JWT
    B->>AI: POST /detect (file bytes via FormData)
    AI->>AI: Extract text (PDF / DOCX / OCR)
    AI->>AI: Split into sentence chunks
    AI->>AI: Extract 20 features per chunk (13 statistical + 4 spaCy NLP + 3 semantic)
    AI->>AI: Logistic Regression scores each chunk (30% weight)
    AI->>AI: RoBERTa scores each chunk (90% weight)
    AI->>AI: Weighted ensemble → per-chunk scores
    AI->>AI: Mean of chunk scores → document score
    AI->>AI: Threshold: <0.55 human / ≥0.55 AI-generated
    AI-->>B: { score, verdict, confidence, chunk_scores }
    B->>HDFS: logEvent(ai_detection, verdict, score, duration_ms)
    B-->>U: 200 { results, model_warning, processed_at }
```

---

## Tech Stack

### Frontend — React 19

| Package | Purpose | Why |
|---------|---------|-----|
| React 19 | UI framework | Virtual DOM diffing, hooks, concurrent mode |
| React Router 6 | Client-side routing | Declarative nested routes, no page reload |
| Axios | HTTP client | Interceptors for JWT cookie refresh + error handling |
| Framer Motion | Animations | Smooth page transitions and micro-interactions |
| Tailwind CSS | Styling | Utility-first; no CSS naming conflicts |
| Recharts | Analytics charts | Composable chart components built on D3 |
| React Hot Toast | Notifications | Non-intrusive, accessible toast system |
| React Dropzone | File upload UX | Drag-and-drop with MIME-type validation |

**Why React?** Component-level encapsulation, large ecosystem, and the ability to co-locate state and UI logic. Concurrent rendering in React 19 keeps the UI responsive during heavy S3 upload progress updates.

### Backend — Node.js / Express 5

| Package | Purpose | Why |
|---------|---------|-----|
| Express 5 | HTTP server | Non-blocking I/O, minimal abstraction over Node's http |
| jsonwebtoken | Auth tokens | Stateless JWT; no server-side session storage |
| Helmet | Security headers | CSP, HSTS, X-Frame-Options, noSniff |
| express-rate-limit | Throttling | Per-route request windows to prevent abuse |
| AWS SDK v3 | S3 client | Streaming multipart uploads, presigned URLs |
| Supabase JS | DB client | PostgreSQL queries + RLS enforcement |
| Multer | File uploads | Buffered multipart parsing before encryption |
| Joi | Input validation | Schema-based request validation at the route level |
| Winston | Structured logging | JSON log output for production aggregation |

**Why Node.js?** I/O-bound workloads (S3 uploads, DB queries, AI service calls) run concurrently on the event loop without threads. JavaScript end-to-end reduces context switching for developers.

### AI Service — Python / FastAPI

| Package | Purpose |
|---------|---------|
| FastAPI | Async HTTP framework with auto-generated OpenAPI docs |
| PyTorch | Deep learning inference (RoBERTa, GPT-2) |
| HuggingFace Transformers | Pre-trained model loading (roberta-base-openai-detector) |
| Scikit-learn | `Pipeline`(RobustScaler + HistGradientBoostingClassifier), `CalibratedClassifierCV` (isotonic), `joblib` serialisation |
| pdfplumber | PDF text extraction (layout-aware) |
| python-docx | DOCX paragraph extraction |
| Pytesseract | OCR for scanned images and image-based PDFs |
| NumPy | Feature vector construction |
| uvicorn | ASGI server (production) |

**Why Python?** De-facto standard for ML — PyTorch, HuggingFace, and scikit-learn have no equivalents in other ecosystems. FastAPI gives near-Express ergonomics with Python's async/await.

### Big Data — Apache Hadoop + Spark

| Component | Role |
|-----------|------|
| HDFS NameNode | Metadata server; tracks block locations |
| HDFS DataNode | Stores actual log file blocks |
| WebHDFS REST API | HTTP interface used by Node.js to write logs without Hadoop client |
| Apache Spark (master + worker) | Distributed computation for batch analytics |
| PySpark | Python API; analytics jobs written as pure DataFrame transformations |
| MapReduce fallback | Pure-Python fallback if Spark is unavailable |

### Cloud / Infrastructure

| Service | Role |
|---------|------|
| AWS S3 | Encrypted file object storage; infinitely scalable |
| Supabase (PostgreSQL 15) | File metadata, user auth, RLS policies, fallback event log |
| Docker Compose | Local orchestration of all 8 containers |
| Redis (optional) | Rate-limit state store in multi-instance deploys |

---

## Project Structure

```
vaultiq/
│
├── frontend/                        React SPA
│   └── src/
│       ├── pages/                   Route-level components
│       │   ├── Login.jsx            Sign-in with JWT cookie auth
│       │   ├── Signup.jsx           Registration + password strength meter
│       │   ├── Dashboard.jsx        Overview: file count, storage, quick actions
│       │   ├── FilesPage.jsx        File browser with search, sort, bulk delete
│       │   ├── Analytics.jsx        Recharts analytics dashboard
│       │   └── TextAiDetection.jsx  AI content scanner (upload / vault / history)
│       ├── components/              Shared UI components
│       │   ├── AIDetector.jsx       AI ensemble result display (score, verdict, chunks)
│       │   ├── FileCard.jsx         Per-file card (name, size, hash, AI score)
│       │   ├── HashBadge.jsx        Truncated SHA-256 integrity badge
│       │   ├── EmptyState.jsx       Empty vault placeholder component
│       │   └── ui/                  Primitive components (Button, Input, AppNavbar, BrandPanel)
│       ├── services/                Axios API layer (api.js, fileService.js, authService.js)
│       ├── api/                     Domain API helpers (aiDetectApi.js)
│       ├── hooks/                   useAuth.js, useFiles.js
│       ├── context/                 AuthContext.jsx (JWT state + silent refresh)
│       └── utils/                   format.js (date/size formatters)
│
├── backend/                         Node.js / Express API
│   ├── server.js                    App bootstrap, middleware, rate limits
│   ├── routes/
│   │   ├── auth.js                  /api/auth (register, login, me, logout, refresh)
│   │   ├── files.js                 /api/files (upload, list, download, delete, stats)
│   │   ├── aiDetection.js           /api/ai-detect (file + vault + text detection + history)
│   │   └── analytics.js             /api/analytics (3-tier read + Spark trigger)
│   ├── middleware/
│   │   ├── auth.js                  JWT authenticateToken middleware
│   │   ├── validate.js              Joi schema validation wrapper
│   │   └── requestId.js             UUID per request (X-Request-ID header)
│   ├── utils/
│   │   ├── crypto.js                AES-256-CBC encrypt/decrypt + SHA-256 hash
│   │   ├── s3.js                    PutObject / GetObject / DeleteObject wrappers
│   │   ├── hdfsLogger.js            Async WebHDFS log writer (Supabase fallback)
│   │   ├── supabase.js              Supabase client (anon + service key)
│   │   ├── logger.js                Winston structured logger
│   │   ├── emailService.js          Nodemailer for lockout/alert emails
│   │   └── accountLockout.js        5-strike lockout with TTL
│   ├── validators/                  Joi schemas for auth + file routes
│   ├── migrations/                  SQL migration files for Supabase
│   ├── data/                        Local AI detection history store
│   └── scripts/
│       ├── migrate.js               Run pending Supabase migrations
│       ├── migrate_pg.js            Direct PostgreSQL migration runner
│       └── spark-jobs/              Spark analytics scripts (submitted to cluster)
│
├── ai-service/                      Python FastAPI microservice (port 8001)
│   ├── main.py                      App entry — /health, /detect, /detect/text
│   ├── core/
│   │   ├── detector.py              Ensemble orchestration (load + RoBERTa + stylometric LR + detect)
│   │   ├── extractor.py             Text extraction (PDF, DOCX, images via OCR)
│   │   └── preprocessor.py          Sentence chunking + normalisation
│   ├── scripts/
│   │   ├── train_full_v4.py         Full retraining pipeline (cleans data, trains Pipeline, calibrates)
│   │   └── optimize_ensemble.py     Grid-tunes RoBERTa/LR blend weights on held-out HC3
│   ├── models/                      lr_model.pkl (Pipeline: RobustScaler + HistGradientBoosting),
│   │                                lr_model_calibrated.pkl (5-fold isotonic),
│   │                                ensemble_config.json (tuned blend weights + threshold),
│   │                                training_metrics.json, decision_threshold.json
│   └── datasets/                    HC3 (all.jsonl), modern_llm_corpus.csv,
│                                    PubMedQA parquets, arxiv metadata JSON
│                                    (Total: 5.6 GB of curated data)
│
├── bigdata/                         PySpark batch analytics
│   ├── analytics_job.py             Main Spark job — 6 analytics functions
│   ├── mapreduce_fallback.py        Pure-Python fallback (no Spark required)
│   ├── run_analytics.sh             Shell orchestrator (submits to cluster)
│   └── results/                     Output JSON (local + HDFS mirror)
│
├── docker-compose.yml               Full 8-container stack definition
├── .env.example                     Environment variable template
└── start.sh                         One-command local dev launcher
```

---

## AI Detection System — Complete Technical Guide

VaultIQ's AI content detector is a **production-ready hybrid ensemble** combining RoBERTa transformer classification with a gradient-boosted classifier over 25 engineered features (including fine-tuned sentence-embedding features). On HC3 domains held out from training it achieves **97.0% accuracy, F1 0.970, ROC-AUC 0.993**, with explainable per-chunk scoring across essays, PDFs, DOCX and scanned images.

### Overview & Architecture

```mermaid
flowchart TD
    Input["Student submission<br/>(PDF/DOCX/TXT/IMG)"] --> Extract["Stage 1: Text Extraction<br/>pdfplumber / python-docx / Tesseract OCR"]
    Extract --> Preprocess["Stage 2: Preprocessing<br/>Normalize whitespace<br/>Split into sentence chunks"]
    Preprocess --> Split["Sentence-level chunks<br/>(50–300 chars each)"]
    
    Split --> StatFeatures["Stage 3A: 13 Stylometric Features<br/>Perplexity, Burstiness, TTR, Avg Length,<br/>Punctuation, Entropy, Word Length,<br/>NER density, Formal vocab, Citations,<br/>Tech terms, Passive voice, Complex sent."]
    Split --> SpacyFeatures["Stage 3B: 4 spaCy NLP Features<br/>Passive voice ratio, POS diversity,<br/>Named entity density, Dependency depth"]
    Split --> SemanticFeatures["Stage 3C: 3 Semantic Features<br/>Sentence-Transformers embeddings<br/>(all-MiniLM-L6-v2)"]
    Split --> RoBERTa["Stage 4: Deep Learning<br/>Fine-tuned RoBERTa Transformer<br/>(12 layers, 125M params)"]
    
    StatFeatures --> AllFeatures["20 Total Features"]
    SpacyFeatures --> AllFeatures
    SemanticFeatures --> AllFeatures
    
    AllFeatures --> LRScore["HistGradientBoosting Pipeline<br/>(RobustScaler + Platt scaling)<br/>30% weight"]
    RoBERTa --> RoBERTaScore["RoBERTa Score<br/>90% weight"]
    
    LRScore --> Ensemble["Stage 5: Weighted Ensemble<br/>0.70 × RoBERTa + 0.30 × LR<br/>(empirically tuned on modern LLMs)"]
    RoBERTaScore --> Ensemble
    
    Ensemble --> ChunkScores["Per-chunk scores"]
    ChunkScores --> DocScore["Document score<br/>(mean of chunks)"]
    DocScore --> Verdict{"Apply Threshold<br/>(0.55)"}
    
    Verdict -->|"score < 0.55"| Human["Verdict: HUMAN-WRITTEN<br/>Confidence: based on chunk count"]
    Verdict -->|"score ≥ 0.55"| AIGen["Verdict: AI-GENERATED<br/>High probability of AI composition"]
    
    Human --> Response["Return JSON response with:<br/>score, verdict, confidence<br/>chunk_scores, warning"]
    AIGen --> Response
```

### Stage 1 — Intelligent Text Extraction

**File Type Support:**

| Format | Method | Accuracy | Notes |
|--------|--------|----------|-------|
| `.pdf` (text-based) | `pdfplumber` layout-aware parsing | 99%+ | Preserves text flow and paragraphs |
| `.pdf` (scanned) | Tesseract v5 OCR | 90–95% | Handles mixed scanned+text PDFs |
| `.docx` | `python-docx` paragraph extraction | 99%+ | Preserves formatting metadata |
| `.txt` | Direct file read | 100% | Plain text passthrough |
| `.jpg`/`.png` | Tesseract OCR on embedded images | 85–92% | Depends on image quality/DPI |

**Extraction Pipeline:**
```python
def extract_text(file_path: str, file_type: str) -> str:
    if file_type == 'pdf':
        # Try layout-aware text extraction first
        text = pdfplumber.open(file_path).extract_text()
        if not text:  # Scanned PDF
            # Fall back to OCR
            return pytesseract.image_to_string(pdf_images)
    elif file_type == 'docx':
        return '\n'.join(p.text for p in docx.Document(file_path).paragraphs)
    elif file_type == 'txt':
        return file_path.read_text()
    return ""
```

**Real-world example:**
- Input: `student_essay.pdf` (3 pages, mixed scanned headers + typed body)
- Extracted: ~1,200 words of clean text
- Processing time: 200–500 ms

---

### Stage 2 — Preprocessing & Intelligent Chunking

Text is normalized and split into **sentence-level chunks** (50–300 characters each) for two reasons:

1. **Transformer context limit:** RoBERTa has a 512-token max input (≈300 words). Chunking allows analysis of longer documents.
2. **Granular detection:** Per-chunk scoring reveals which sections are AI-generated, useful for identifying plagiarism vs. collusion.

**Chunking algorithm:**
```
1. Normalize: remove extra whitespace, newlines
2. Split on [.!?] boundaries (sentence-aware)
3. Merge short chunks (< 50 chars) with neighbors
4. Cap at 300 chars per chunk (transformer safety)
5. Return list of chunks with preserved sentence structure
```

**Example:**
```
Input text:
"The climate crisis demands urgent action. Scientists agree. We must reduce emissions."

Output chunks:
[
    "The climate crisis demands urgent action.",
    "Scientists agree.",
    "We must reduce emissions."
]
```

**Chunking impact on accuracy:**
- Small chunks (< 50 chars) → noisy scoring, low confidence
- Optimal chunks (100–250 chars) → balanced semantic context + statistical features
- Large chunks (> 300 chars) → truncated by tokenizer, information loss

---

### Stage 3 — Feature Engineering (30% Model Weight)

Twenty numerical features are extracted per chunk by `core.detector.extract_features`, `extract_spacy_features`, and `extract_semantic_features`. They capture **stylometric patterns**, **linguistic structure**, and **semantic embeddings** distinctive to AI text.

**Component 1: Statistical Features (13)**

| # | Feature | Calculation | AI Indicator | Human Baseline |
|---|---------|-------------|--------------|-----------------|
| **1** | **Perplexity** | Cross-entropy loss via GPT-2 (with word-length-variance fallback) | Lower (0.5–2.0) | Higher (2.0–8.0) |
| **2** | **Burstiness** | Var(sentence_lengths) / Mean(sentence_lengths) | Lower (~0.1–0.3) | Higher (~0.8–1.5) |
| **3** | **Type-Token Ratio (TTR)** | Unique words / Total words | Lower (0.45–0.55) | Higher (0.55–0.75) |
| **4** | **Avg Sentence Length** | Mean word count per sentence | Higher (15–18 words) | More varied (10–16 words) |
| **5** | **Punctuation Density** | Punct. chars / Total chars | Lower (0.02–0.04) | Higher (0.04–0.08) |
| **6** | **Word Entropy** | Shannon entropy of word frequency dist. | Lower (6.0–7.0) | Higher (7.0–8.5) |
| **7** | **Avg Word Length** | Mean characters per word | Higher (5.2–5.8) | Slightly lower (4.8–5.2) |
| **8** | **Named Entity Density** | Capitalized words / Total words | Lower (0.08–0.12) | Higher (0.12–0.20) |
| **9** | **Formal Vocabulary Ratio** | Share of academic words (however, therefore, methodology, phenomenon, …) | Higher in AI-generated essays | Lower in casual human text |
| **10** | **Citation Density** | Rate of reference markers (`et al.`, `[1]`, `doi:`, `arxiv:`) | Often over-used or mis-formatted in AI | Consistent with source material in humans |
| **11** | **Technical Term Ratio** | Share of domain words (algorithm, gradient, neural, attention, …) | Elevated in AI explanations | Tied to actual domain in humans |
| **12** | **Passive Voice Ratio** | Sentences containing `was/were/been/is/are/being` | Higher (AI over-uses passive) | Lower / more varied |
| **13** | **Complex Sentence Ratio** | Sentences with multi-clause markers (`;`, `because`, `although`, …) | Consistently high | Naturally variable |

**Component 2: spaCy NLP Features (4)**

| # | Feature | Calculation | AI Indicator |
|---|---------|-------------|--------------|
| **14** | **Passive Voice Ratio (spaCy)** | True dependency parsing of passives | Higher (formulaic) | Lower (varied) |
| **15** | **POS Diversity** | Unique part-of-speech tags | Lower (repetitive) | Higher (varied) |
| **16** | **Named Entity Density (spaCy)** | Real NER count / total words | Lower (generic) | Higher (specific) |
| **17** | **Dependency Depth** | Max parse tree depth (syntactic complexity) | More consistent | Variable |

**Component 3: Semantic Features (3)**

| # | Feature | Calculation | AI Indicator |
|---|---------|-------------|--------------|
| **18–20** | **Embedding Dimensions** | all-MiniLM-L6-v2 sentence embeddings | Semantic patterns | Semantic patterns |

**Why these features?**

- **Perplexity:** LLMs produce text that *fits* language patterns too perfectly; GPT-2 "surprises" less.
- **Burstiness:** Humans naturally vary sentence length; AI is formulaic.
- **TTR / Word Entropy:** AI relies on a smaller active vocabulary; human writing is more diverse.
- **Punctuation Density:** AI uses punctuation according to statistical norms; humans are idiosyncratic.
- **Features 9–13 (academic markers):** Added specifically to distinguish ChatGPT-style formal writing from *genuine* scientific/academic human text (arxiv abstracts, PubMedQA long-answers) — without these, the model incorrectly treats any formal prose as AI.

**Classifier:** `Pipeline(RobustScaler → HistGradientBoostingClassifier(max_iter=500, learning_rate=0.07, max_depth=8, class_weight='balanced', early_stopping=True))`, wrapped in `CalibratedClassifierCV(method='isotonic', cv=5)` so the raw scores are well-calibrated probabilities.

---

### Stage 4 — Deep Learning Classifier (90% Model Weight)

**Models:** `Hello-SimpleAI/chatgpt-detector-roberta` + `roberta-base-openai-detector` (AI probabilities averaged). Details below describe the OpenAI checkpoint.

- **Base:** RoBERTa (Robustly Optimized BERT, 12 layers, 125M parameters)
- **Fine-tuning:** OpenAI fine-tuned on GPT-2 generated text vs. WebText corpus
- **Input:** Up to 512 tokens (≈300 words)
- **Output:** 2-class logits (`id2label={0:'Fake', 1:'Real'}`) → softmax → **P(AI-generated) = probs[0]** in [0.0, 1.0]. Reading index 0 is important — the model's label order is `Fake` first, `Real` second.

**Why RoBERTa?**
- Pre-trained on 160GB of English text (CommonCrawl + Books + Wikipedia)
- Learns **deep semantic patterns:** syntax, coherence, domain knowledge, linguistic naturalness
- Catches subtle AI signals: unnatural pronoun consistency, absence of personal anecdotes, over-reliance on hedging ("perhaps", "it could be argued")
- Transfer learning: generalizes well despite training data distribution shift (GPT-2 → newer LLMs like GPT-4)

**RoBERTa advantages over pure statistical models:**
| Aspect | Statistical Features | RoBERTa |
|--------|---------------------|---------|
| Detects word choice patterns | ✓ | ✓✓ (learns semantic relationships) |
| Handles diverse domains | ✓ | ✓✓ (pretrained on internet-scale data) |
| Resistant to adversarial obfuscation | ✗ | ✓ (semantic understanding) |
| Inference time | <1 ms | 50–100 ms (GPU) / 200–500 ms (CPU) |
| Model size | <1 MB | 480 MB |

**Per-chunk scoring example:**
```
Chunk: "The rapid advancement of artificial intelligence presents both 
        opportunities and challenges for society."

RoBERTa P(AI):          0.82
LR P(AI) (25 features): 0.45
Ensemble:               0.90 × 0.82 + 0.10 × 0.45 = 0.783
Verdict:                AI-generated  (≥ 0.50 threshold)
```

---

### Stage 5 — Weighted Ensemble & Decision Thresholds

**Ensemble formula (weights live in `models/ensemble_config.json`, loaded at startup):**
```
ensemble_score = w_roberta × roberta_score + w_lr × lr_score + w_nn × neural_head_score
               = 0.90 × roberta_score + 0.10 × lr_score + 0.00 × neural_head_score   (current)
```

**How the weights are chosen:**
- `scripts/optimize_ensemble.py` grid-searches the weights and threshold on a validation split of HC3, scoring the exact models the service loads, and reports on held-out domains (medicine, wiki_csai) it never tunes on.
- **RoBERTa (0.90):** strongest single component on held-out domains.
- **LR (0.10):** calibrated gradient-boosted classifier over 25 engineered features (statistical + spaCy + semantic + document-embedding).
- **Neural head (0.00):** MLP over fine-tuned MiniLM chunk embeddings + the 25 features. It is kept but disabled because it overfits to topic (see [AI detection architecture](docs/architecture/ai-detection.md), section 5).
- Weights and thresholds are stored in `ensemble_config.json` so they can be re-tuned without code changes.

**Decision Thresholds** (applied by `detect()` to the mean chunk score; `threshold` in `ensemble_config.json` is currently `0.50`):

| Score Range | Verdict | Recommended Action |
|-------------|---------|------------------|
| < 0.325 (threshold × 0.65) | **Human-written** | ✓ Accept submission |
| 0.325 – 0.50 | **Mixed** | Review |
| ≥ 0.50 | **AI-generated** | ✗ Flag / Further review |

**Confidence levels (based on chunk count):**
```
< 3 chunks  → "low"    (insufficient evidence)
3–5 chunks  → "medium" (adequate evidence)
> 5 chunks  → "high"   (strong evidence)
```

**Example outputs:**
```json
{
  "filename": "essay.pdf",
  "score": 0.78,
  "verdict": "ai_generated",
  "confidence": "high",
  "chunk_scores": [0.81, 0.75, 0.80, 0.78],
  "warning": null
}
```

---

### Performance & Accuracy Metrics

**Benchmark Results** — 3,000 serving-style chunks (balanced) from HC3 domains held out from training and tuning (medicine, wiki_csai):

| Metric | LR (25 features) | Neural head | RoBERTa | Previous ensemble (0.45/0.55) | **Current ensemble (0.90/0.10)** |
|--------|---:|---:|---:|---:|---:|
| Accuracy | 87.6% | 84.3% | 96.9% | 87.3% | **97.0%** |
| Precision | 80.7% | 76.6% | 95.3% | 95.5% | **95.0%** |
| Recall | 98.9% | 98.7% | 98.6% | 78.3% | **99.2%** |
| F1-Score | 0.889 | 0.863 | 0.969 | 0.861 | **0.970** |
| ROC-AUC | 0.985 | 0.977 | 0.992 | 0.971 | **0.993** |

Caveats: the `Hello-SimpleAI` RoBERTa checkpoint is believed to be trained on HC3, so its numbers here are likely optimistic; HC3 is ChatGPT-3.5-era text. The previously quoted 98.30% was measured on in-domain data and is not comparable.

**Inference Performance:**

| Component | Latency | Notes |
|-----------|---------|-------|
| Text extraction | 100–500 ms | Depends on file size & OCR needed |
| Preprocessing | 10–50 ms | Fast text normalization |
| Statistical features | 50–200 ms | Per-chunk: ~10 ms × chunks |
| RoBERTa scoring | 200–500 ms | Per-chunk: ~50 ms × chunks (GPU: ~5 ms) |
| **Total (5 chunks)** | **500–1500 ms** | Typically 800 ms on CPU |
| **Total (5 chunks, GPU)** | **200–400 ms** | Recommended for production |

**Throughput:**
- Single document (5 chunks): ~1 sec (CPU) / 0.3 sec (GPU)
- Batch of 5 documents: ~5 sec (CPU) / 1.5 sec (GPU)

---

### Model Training Pipeline

**Full training flow** (everything in `ai-service/`):

Full instructions: [ai-service/docs/TRAINING_RUNBOOK.md](ai-service/docs/TRAINING_RUNBOOK.md).

```bash
cd ai-service
python scripts/training_data.py download            # HC3 → datasets/all.jsonl
python scripts/finetune_embeddings.py               # → models/embedding_model/ (optional, deep learning)
python scripts/retrain_with_enhanced_features.py    # → models/lr_model_v6_calibrated.pkl (25 features)
python scripts/train_neural_head.py                 # → models/neural_head.pt (deep learning)
python scripts/optimize_ensemble.py --exclude-nn    # → models/ensemble_config.json
```

No code edits needed to pick up new weights — `core.detector.load_models()` reads `ensemble_config.json` at startup.

**Training data** (96k+ balanced samples after cleaning, from `modern_llm_corpus.csv`):

| Source | Role | Size |
|--------|------|------|
| HC3 `all.jsonl` | Paired human vs ChatGPT answers to the same question | 23k |
| Modern LLM Subsets | Included GPT-4, Claude 3.5, Gemini synthetic completions | 32k |
| PubMedQA | Scientific / medical human writing — teaches the model that *formal ≠ AI* | 21k |
| ArXiv reservoir | Adds non-medical formal human prose (CS / math / physics) | 20k |

**Feature scaling:** handled **inside** the saved `Pipeline` (`RobustScaler`), so `detector.py` passes raw 13-dim vectors and scaling is automatic.

**Fallback behavior:**
- If `lr_model_calibrated.pkl` is missing → `detect()` logs an error and skips the LR model, returning only the Dual-RoBERTa average. The frontend receives `model_warning`.
- If `ensemble_config.json` is missing → weights fall back to hard-coded safe defaults.

---

### Integration & API Usage

**Frontend Component:** `AIDetector.jsx`

```jsx
const [results, setResults] = useState(null);
const [loading, setLoading] = useState(false);

const handleDetect = async (files) => {
  setLoading(true);
  try {
    const data = await detectFiles(files);  // POST /api/ai-detect
    setResults(data.results);
    if (data.model_warning) {
      toast.warning(data.model_warning);  // Alert user if LR unavailable
    }
  } catch (error) {
    toast.error(error.message);
  } finally {
    setLoading(false);
  }
};
```

**Response Structure:**

```json
{
  "results": [
    {
      "filename": "report.pdf",
      "raw_text_preview": "The rapid advancement...",
      "chunks_count": 5,
      "score": 0.76,
      "verdict": "ai_generated",
      "confidence": "high",
      "chunk_scores": [0.81, 0.75, 0.80, 0.78, 0.72],
      "status": "ok"
    }
  ],
  "model_warning": null,
  "processed_at": "2026-04-18T10:30:00Z"
}
```

---

### Known Limitations & Edge Cases

| Scenario | Impact | Mitigation |
|----------|--------|-----------|
| **Very short text** (< 50 words) | Low confidence, unreliable | Confidence marked "low", recommend manual review |
| **Mixed human + AI** | May underestimate AI% | Per-chunk scores reveal which sections are AI |
| **Domain shift** (e.g., technical papers) | Slight accuracy drop (~2–3%) | Retraining on domain-specific corpus recommended |
| **Adversarial obfuscation** (intentional paraphrasing) | Can bypass detection | No detector is fully robust; combine with plagiarism checks |
| **Non-English text** | Not supported | English-only; RoBERTa multilingual variant available but not deployed |
| **Code or pseudocode** | Unreliable | Not designed for programming; statistical features may misfire |
| **Bullet points / lists** | Lower accuracy | Designed for prose; may flag legitimate lists as AI |

---

### Best Practices for Maximum Accuracy

1. **Use text-based PDFs when possible** — OCR introduces noise (5% accuracy loss)
2. **Combine with plagiarism detection** — AI + plagiarism checks catch more cases
3. **Review threshold-boundary results** (0.33–0.37, 0.63–0.67) — manual spot-check recommended
4. **Per-chunk analysis** — if 4/5 chunks are AI but overall score is 0.68, it's mixed/assisted
5. **Retrain periodically** — new LLMs evolve; retraining every 6 months maintains accuracy
6. **Ensemble with human review** — no automation is perfect; flag high-confidence results for teacher review

---

### Configuration & Customization

**Weighting the ensemble and setting thresholds** — do **not** hard-code in `detector.py`. Update `models/ensemble_config.json`:

```json
{
  "w_roberta": 0.45,
  "w_lr": 0.55,
  "threshold": 0.52
}
```

`detector.load_models()` reads this at startup.

---

### Model Training & Retraining

Scripts cover the full retraining lifecycle — safe to re-run:

```bash
cd ai-service

# 1. Retrain the stylometric Pipeline on everything in datasets/
python scripts/retrain_lr_v5.py
#    → overwrites models/lr_model_calibrated.pkl, training_metrics.json
#    → features are cached in models/feature_cache_v5_fast.npz so subsequent runs skip the
#      slow ~30 min feature extraction step
```

**Retraining recommended when:**
- New LLM emerges with a different stylistic signature (GPT-5, Claude 4.x, etc.)
- False-positive rate > 5–10% on your institution's submissions
- Domain shift — e.g., rise of a new submission type (legal briefs, code reviews, medical case studies)
- Adding a new dataset to `ai-service/datasets/`

**Process:**
1. Drop new labeled data into `ai-service/datasets/` (e.g. updating `modern_llm_corpus.csv`).
2. Delete `models/feature_cache_v5_fast.npz` so features are re-extracted against the new corpus.
3. Run `python scripts/retrain_lr_v5.py` — check `training_metrics.json` for the new held-out AUC.
4. Smoke-test `POST /detect` against a few known-label docs; then deploy.

---

### Deployment Considerations

**Resource requirements:**
- **Memory:** 2 GB minimum (RoBERTa + GPT-2 models loaded)
- **CPU:** 2 cores sufficient; GPU recommended for production
- **Disk:** 1 GB for models
- **Network:** Minimal; ~1–5 MB per request

**Docker optimization:**
```dockerfile
# Use GPU-enabled base for production
FROM pytorch/pytorch:2.1-cuda12.1-runtime-ubuntu22.04
```

**Monitoring:**
- Track inference latency per document size
- Monitor per-chunk score distribution
- Alert if model_warning appears in > 1% of responses
- Log false positives from teacher feedback

---

## Big Data Pipeline Deep-Dive

Every user action in VaultIQ generates a structured event log that feeds a distributed analytics pipeline built on Apache Hadoop and Apache Spark.

### Event Logging Architecture

```mermaid
flowchart LR
    Action["User action<br/>upload, download, delete, ai_detect"] --> Node["Node.js Backend"]
    Node --> HDFSCheck{"HDFS<br/>available?"}
    HDFSCheck -->|"yes"| HDFS["HDFS DataNode<br/>/vaultiq/logs/YYYY-MM-DD/"]
    HDFSCheck -->|"no"| Supa["Supabase<br/>event_logs table (fallback)"]
```

`utils/hdfsLogger.js` writes each event as a JSON file to HDFS via the WebHDFS REST API. The path follows a date-partitioned layout (`/vaultiq/logs/YYYY-MM-DD/`) that Spark reads as a partitioned dataset. If WebHDFS is unreachable, the logger silently falls back to inserting the event into the `event_logs` table in Supabase.

**Event schema:**
```json
{
  "event_type":       "file_upload",
  "user_id":          "uuid",
  "filename":         "report.pdf",
  "file_size_bytes":  204800,
  "file_type":        "pdf",
  "ai_verdict":       "human",
  "ai_score":         0.12,
  "duration_ms":      342,
  "timestamp":        "2026-04-14T10:23:00Z",
  "ip":               "1.2.3.4"
}
```

### Analytics — 3-Tier Read Strategy

The backend analytics endpoint tries three sources in order before falling back to an empty payload. This means the dashboard always loads, even when HDFS and Spark are unavailable.

```mermaid
flowchart TD
    Request["GET /api/analytics"] --> T1{"Tier 1<br/>HDFS WebHDFS"}
    T1 -->|"success"| Norm["normalizeForFrontend()<br/>converts raw shape to UI shape"]
    T1 -->|"unavailable"| T2{"Tier 2<br/>Local JSON cache<br/>bigdata/results/analytics_latest.json"}
    T2 -->|"success"| Norm
    T2 -->|"not found"| T3{"Tier 3<br/>Supabase live query<br/>files + event_logs tables"}
    T3 -->|"success"| Norm
    T3 -->|"error"| Empty["Empty payload<br/>charts show zeros"]
    Norm --> Frontend["Analytics.jsx<br/>renders charts"]
```

### Spark Batch Analytics

`bigdata/analytics_job.py` is submitted to the Spark cluster (or run locally with `local[*]`). It reads all logs from HDFS, performs six independent aggregations, and writes a single `analytics_latest.json` result file back to HDFS and a local copy to `bigdata/results/`.

```mermaid
flowchart TD
    HDFS["HDFS /vaultiq/logs/"] --> Spark["SparkSession read.json"]
    Spark --> Parse["Parse timestamp to date column"]

    Parse --> J1["daily_activity<br/>Events per day by type<br/>and bytes per day"]
    Parse --> J2["anomaly_detection<br/>Delete spikes sigma above 2<br/>and high-volume users"]
    Parse --> J3["ai_usage_stats<br/>Verdict distribution<br/>and avg score by file type"]
    Parse --> J4["storage_analytics<br/>Top uploaders<br/>and file type distribution"]
    Parse --> J5["latency_analysis<br/>Avg and p95 latency<br/>and busiest hours 0 to 23"]
    Parse --> J6["user_behaviour<br/>DAU last 30 days<br/>returning users<br/>event sequences"]

    J1 --> Results["analytics_latest.json"]
    J2 --> Results
    J3 --> Results
    J4 --> Results
    J5 --> Results
    J6 --> Results

    Results --> HDFSOut["HDFS /vaultiq/results/"]
    Results --> LocalOut["bigdata/results/"]
    Results --> S3Archive["AWS S3 Bucket<br/>(Cold Storage Archive)"]
    Results --> API["Backend /api/analytics<br/>serves normalised payload to frontend"]
```

**Six analytics produced:**

| Function | What it computes |
|----------|-----------------|
| `daily_activity` | Per-day upload/download/AI-detection counts + total bytes |
| `anomaly_detection` | Delete spikes (mean + 2-sigma threshold) + users with more than 50 events per hour |
| `ai_usage_stats` | Verdict distribution (human/mixed/ai); avg AI score by file type |
| `storage_analytics` | Top 10 uploaders by bytes; file-type breakdown by count + size |
| `latency_analysis` | Average and p95 latency per event type; 24-hour activity heatmap |
| `user_behaviour` | DAU (last 30 days); returning users (more than 3 active days); event sequence patterns |

### MapReduce Fallback

`bigdata/mapreduce_fallback.py` provides a single-machine, pure-Python implementation of the same analytics using the built-in `collections.Counter` and `statistics` modules. It is invoked when the Spark cluster is unavailable, ensuring analytics are never silently absent.

### Docker Cluster (Hadoop + Spark)

```
namenode     ← HDFS NameNode + WebHDFS REST (port 9870)
datanode     ← HDFS DataNode (stores blocks)
spark-master ← Spark coordinator (port 8080, 7077)
spark-worker ← Spark executor (1 core / 1 GB RAM)
```

The `bigdata/` directory is volume-mounted into both Spark containers so jobs can be submitted with `spark-submit /opt/spark-jobs/analytics_job.py`.

---

## Cloud Infrastructure Deep-Dive

### AWS S3 — Encrypted Object Storage

```mermaid
flowchart LR
    Client["User uploads file"] --> Backend["Backend (Node.js)"]
    Backend -->|"1. AES-256-CBC encrypt<br/>random 16-byte IV"| Cipher["Ciphertext"]
    Cipher -->|"2. SHA-256 hash<br/>stored in Supabase DB"| Hash["Integrity hash"]
    Cipher -->|"3. PutObject<br/>s3://bucket/userId/fileId"| S3[("AWS S3")]
    S3 -->|"4. GetObject stream on download"| Dec["Decrypt in backend"]
    Dec -->|"5. Verify SHA-256<br/>reject if tampered (HTTP 409)"| User["User receives file"]
```

- Files are stored under `{userId}/{fileId}` keys — no file from one user can be accessed by another even if S3 permissions were misconfigured, because the backend enforces `user_id` ownership before generating the S3 key.
- S3 server-side encryption (SSE-S3 or SSE-KMS) adds a second layer of encryption at rest on top of the application-level AES encryption.

### AWS S3 — Cold Storage Archiving (Big Data)

To ensure the safety of analytics data stored locally in HDFS on the EC2 instance, the daily Spark job automatically archives the generated `analytics_latest.json` payload directly to an AWS S3 bucket using the Python `boto3` SDK. 
This creates a resilient "Cold Storage" backup, allowing the local HDFS to operate purely as a fast "Hot Processing" layer without risking data loss upon EC2 instance termination.

### Supabase (PostgreSQL 15) — Metadata & Auth

```mermaid
erDiagram
    users {
        uuid id PK
        text email
        text full_name
        timestamptz created_at
    }
    files {
        uuid id PK
        uuid user_id FK
        text filename
        bigint file_size
        text mime_type
        text s3_key
        text sha256_hash
        timestamptz uploaded_at
    }
    event_logs {
        uuid id PK
        uuid user_id FK
        text event_type
        jsonb payload
        timestamptz timestamp
    }
    users ||--o{ files : owns
    users ||--o{ event_logs : generates
```

Row-Level Security (RLS) is enabled on `files` and `event_logs`. All queries are automatically filtered to the authenticated user's `user_id` — a rogue query for another user's files returns 0 rows rather than an error, preventing enumeration attacks.

### Authentication Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant B as Backend
    participant S as Supabase Auth

    U->>B: POST /api/auth/login { email, password }
    B->>S: signInWithPassword()
    S-->>B: { access_token, refresh_token, user }
    B->>B: Sign JWT (1h access + 7d refresh)
    B->>B: Set HttpOnly SameSite=Strict cookies
    B-->>U: 200 { user } — no token in response body

    Note over U,B: Subsequent requests
    U->>B: GET /api/files (cookie sent automatically by browser)
    B->>B: Verify JWT signature and expiry
    B-->>U: 200 { files }

    Note over U,B: Silent token refresh (interceptor in api.js)
    U->>B: Any request — 401 received
    B-->>U: 401 Unauthorized
    U->>B: POST /api/auth/refresh (refresh cookie)
    B->>B: Verify refresh token, issue new pair
    B->>B: Rotate both cookies
    B-->>U: 200 OK — original request retried automatically
```

Tokens are never exposed to JavaScript — `HttpOnly` prevents `document.cookie` access. `SameSite=Strict` blocks all cross-origin cookie transmission, eliminating CSRF without CSRF tokens. On access token expiry, `api.js` queues concurrent requests and silently refreshes once, then replays all queued requests.

### Docker Compose — Full Stack

Running `docker compose up -d` starts all 8 containers in dependency order:

```
postgres (db)
redis
ai-service     → depends on: (none)
backend        → depends on: db, redis, ai-service
namenode       → formats HDFS on first boot
datanode       → depends on: namenode (healthy)
spark-master
spark-worker   → depends on: spark-master
```

The `frontend` is served separately during development (`npm start`). In production, an Nginx container serves the built React app and proxies `/api` to the backend.

---

## Security Model

| Layer | Mechanism | Protection |
|-------|-----------|------------|
| Transport | HTTPS / TLS (production) | Prevents eavesdropping |
| Auth | JWT in HttpOnly cookies | XSS cannot steal tokens |
| CSRF | SameSite=Strict + CORS whitelist | No CSRF tokens needed |
| File encryption | AES-256-CBC + random IV per file | Encrypted at rest in S3 |
| Integrity | SHA-256 hash verified on every download | Detects S3 tampering (HTTP 409) |
| RLS | Supabase row-level security | All queries auto-scoped to `user_id` |
| Brute force | 5 strikes → 15-min lockout + email alert | Account takeover prevention |
| Rate limiting | Global 1000/15m, auth 10/15m, upload 100/hr, files 60/min | DoS and abuse prevention |
| Input validation | Joi schemas on all routes | Rejects malformed requests early |
| Headers | Helmet (CSP, HSTS, X-Frame-Options, noSniff) | Browser-level protections |

---

## Setup & Running

### Prerequisites

- **Node.js** v18+
- **Python** 3.11+
- **Docker** (for Hadoop/Spark/Postgres containers)
- System packages: `brew install tesseract poppler` (macOS) or `apt-get install tesseract-ocr poppler-utils`

### 1. Clone & Install

```bash
git clone <repo-url> && cd vaultiq

# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend && npm install && cd ..

# AI Service
python3 -m venv .venv
source .venv/bin/activate
pip install -r ai-service/requirements.txt
```

### 2. Environment Variables

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

**`backend/.env` — required variables:**

```env
# Server
PORT=5000
NODE_ENV=development

# Security — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<64-char-hex>
ENCRYPTION_KEY=<64-char-hex>

# Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-role-key>

# AWS S3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET_NAME=vaultiq-files

# Services
AI_SERVICE_URL=http://localhost:8001
HDFS_WEBHDFS_URL=http://localhost:9870/webhdfs/v1
HDFS_ENABLED=false        # set true when Hadoop is running
```

### 3. Database Migrations

In Supabase SQL Editor, run the migration files in order:

```
backend/migrations/000_database_rls_setup.sql
backend/migrations/001_add_indexes.sql
backend/migrations/002_setup.sql
backend/migrations/create_event_logs.sql
```

### 4. Run (All Services)

```bash
./start.sh
```

Or start individually in separate terminals:

```bash
# Terminal 1 — Frontend
cd frontend && npm start

# Terminal 2 — Backend
cd backend && npm run dev

# Terminal 3 — AI Service
source .venv/bin/activate
cd ai-service && uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# Terminal 4 — Big Data Stack (optional)
docker compose up namenode datanode spark-master spark-worker -d
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| AI Service | http://localhost:8001 |
| AI OpenAPI Docs | http://localhost:8001/docs |
| Hadoop NameNode UI | http://localhost:9870 |
| Spark Master UI | http://localhost:8080 |

### 5. Production (Docker)

```bash
docker compose up -d
```

---

## API Reference

### Health

```
GET  /api/health                      Backend uptime + memory usage
GET  http://localhost:8001/health     AI service + model load status
```

### Auth

```
POST /api/auth/register               { email, password, fullName }
POST /api/auth/login                  { email, password }
POST /api/auth/logout
POST /api/auth/refresh                Rotate access + refresh tokens
GET  /api/auth/me                     Returns { id, email, fullName }  (requires auth)
```

### Files

```
POST   /api/files/upload              multipart/form-data  (requires auth)
GET    /api/files                     Paginated file list  (requires auth)
GET    /api/files/stats               { totalFiles, storageBytes }  (requires auth)
GET    /api/files/:id/download        Stream decrypted file  (requires auth)
DELETE /api/files/:id                 Delete single file  (requires auth)
DELETE /api/files/bulk                { fileIds: [...] } — up to 50  (requires auth)
```

### Collections (Public Submission)

```
GET  /api/share/:shareCode            Fetch collection schema (name, fields, deadline)  (public)
POST /api/share/:shareCode/submit     Submit assignment (multipart files + custom fields)  (public)
```

**Example: Student submission payload:**
```json
{
  "student_name": "John Doe",
  "student_email": "john@school.edu",
  "student_id": "12345",
  "custom_fields": {
    "field_1776426502119": 42
  },
  "files": [<multipart file 1>, <multipart file 2>]
}
```

### Collections (Teacher Management)

```
POST /api/collections                 Create collection with custom fields  (requires auth)
GET  /api/collections                 List user's collections + submission counts  (requires auth)
GET  /api/collections/:id             Get collection details  (requires auth)
GET  /api/collections/:id/submissions List all submissions + signed download URLs  (requires auth)
POST /api/collections/:id/detect      Manually trigger AI detection on submissions  (requires auth)
```

### AI Detection

```
POST /api/ai-detect                   multipart, files field — up to 5 files  (requires auth)
POST /api/ai-detect/from-vault        { fileIds: [...] } — detect vault files  (requires auth)
POST /api/ai-detect/check             { text: "..." } — raw text detection  (requires auth)
GET  /api/ai-detect/history           User's past detection results  (requires auth)
```

**Detection response:**
```json
{
  "results": [
    {
      "filename": "report.pdf",
      "score": 0.78,
      "verdict": "ai_generated",
      "confidence": "high",
      "chunk_scores": [0.82, 0.75, 0.76],
      "similarity_score": 0.012,
      "similarity_verdict": "low",
      "warning": null
    }
  ],
  "model_warning": null,
  "processed_at": "2026-04-14T10:23:00Z"
}
```

### Analytics

```
GET  /api/analytics                   Latest analytics (HDFS → local cache → Supabase live)
POST /api/analytics/trigger           Spawn Spark batch job in background
```

**Analytics response shape:**
```json
{
  "_source": "hdfs | cache | live | empty",
  "platform_totals": { "total_events": 0, "active_users": 0, "total_bytes_uploaded": 0 },
  "daily_trend":     [{ "date": "YYYY-MM-DD", "uploads": 0, "downloads": 0 }],
  "event_breakdown": [{ "event": "Uploads", "count": 0 }],
  "hourly_pattern":  [{ "hour": 0, "events": 0 }],
  "anomalies":       [{ "user_id": "...", "off_hours_events": 0, "date": "..." }]
}
```

---

## Deployment

### Option 1: AWS Elastic Beanstalk (Backend) + Vercel (Frontend) — Recommended

**Best for:** Student projects, small teams, free tier usage.

**Cost:** Free for 12 months (AWS), then ~$10-20/month for backend. Frontend free forever.

#### Deploy Backend to AWS Elastic Beanstalk

```bash
# 1. Install EB CLI
pip install awsebcli

# 2. Initialize Elastic Beanstalk
cd backend
eb init -p node.js-20 vaultiq-backend --region us-east-1

# 3. Create environment
eb create vaultiq-prod

# 4. Set environment variables
eb setenv \
  PORT=5000 \
  NODE_ENV=production \
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  SUPABASE_URL=<your-url> \
  SUPABASE_ANON_KEY=<your-key> \
  SUPABASE_SERVICE_KEY=<your-key> \
  AWS_ACCESS_KEY_ID=<your-id> \
  AWS_SECRET_ACCESS_KEY=<your-secret> \
  AWS_REGION=us-east-1 \
  S3_BUCKET_NAME=<your-bucket> \
  AI_SERVICE_URL=http://your-ai-service.com \
  ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app

# 5. Deploy
eb deploy

# 6. Get your live backend URL
eb open
# Note the URL like: vaultiq-prod.us-east-1.elasticbeanstalk.com
```

#### Deploy Frontend to Vercel

```bash
# 1. Push code to GitHub
git push origin main

# 2. Go to https://vercel.com
# 3. Click "New Project" → import your GitHub repo
# 4. Set environment variables:
#    REACT_APP_API_URL = https://vaultiq-prod.us-east-1.elasticbeanstalk.com
# 5. Click "Deploy"

# Your frontend will be live at: https://vaultiq.vercel.app (or your domain)
```

#### Share with Students

```
Teacher: https://vaultiq.vercel.app/dashboard
Student submit link: https://vaultiq.vercel.app/submit/abc123def456
```

---

### Option 2: Railway (Backend) + Vercel (Frontend) — Simpler

**Best for:** Quick deployment with minimal config.

**Cost:** Free tier + paid as you scale (~$5-10/month typical).

#### Deploy Backend to Railway

```bash
# 1. Go to https://railway.app
# 2. Sign up with GitHub
# 3. Click "New Project" → "Deploy from GitHub repo"
# 4. Select vaultiq repository
# 5. Add environment variables (same as above)
# 6. Deploy button — auto-deploys from git
# 7. Get backend URL from "Deployments" tab
```

Then follow Vercel steps above for frontend.

---

### Option 3: Docker on VPS (Full Control)

**Best for:** Learning DevOps, custom configurations.

**Cost:** ~$5-20/month for VPS (DigitalOcean, Linode, etc).

```bash
# On your VPS:
git clone <repo> && cd vaultiq
docker compose -f docker-compose.prod.yml up -d
# Reverse proxy (Nginx) in front on port 80/443
```

---

## Production Checklist

- [ ] Set `NODE_ENV=production` in backend `.env`
- [ ] Enable HTTPS (free via Let's Encrypt)
- [ ] Set `JWT_SECRET` and `ENCRYPTION_KEY` to strong random values
- [ ] Use managed PostgreSQL (Supabase, AWS RDS) — don't self-host
- [ ] Use AWS S3 for file storage with proper IAM permissions
- [ ] Enable CORS whitelist: only allow your frontend domain
- [ ] Set up monitoring/alerting (Sentry, DataDog, etc)
- [ ] Regular backups of Supabase database
- [ ] Test full submission flow end-to-end before announcing to students

---

## Troubleshooting

**"Missing required environment variables"**
- Check `backend/.env` exists and all variables listed in `server.js` `REQUIRED_ENV` array are set.

**"AI models not loaded"**
- Activate the Python `.venv` before starting the AI service.
- Run `pip install torch transformers` if torch is missing.
- First start downloads ~500 MB of model weights from HuggingFace — allow 2–5 minutes.

**"S3 access denied"**
- Verify `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` and that the IAM role has `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the bucket.

**"Student submit link redirects to login"**
- The `/submit/:code` route is public and should NOT redirect to login.
- **Fix:** Ensure `frontend/src/services/api.js` line 27 includes `/submit` in the PUBLIC routes list.
- Clear browser cache: `Ctrl+Shift+Delete` in DevTools.
- Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows).

**"Collection not found or 404 on /api/share/:code"**
- Verify the share code is correct — check database for valid codes.
- Ensure collection status is `'active'` (not `'closed'` or `'archived'`).
- Check if deadline has passed — expired collections reject submissions.

**"File upload fails with 'type not allowed'"**
- Verify file extension matches allowed types (e.g., use `.pdf` not `.PDF`).
- Check collection's `allowed_types` in Supabase: `SELECT allowed_types FROM collections WHERE id='...'`
- Try uploading a `.pdf`, `.docx`, or `.txt` file.

**"File integrity check failed" (HTTP 409)**
- The file was modified or corrupted in S3 after upload. The SHA-256 stored in Supabase no longer matches the ciphertext. Delete the file and re-upload.

**"HDFS connection refused"**
- Set `HDFS_ENABLED=false` in `.env` to use Supabase fallback logging (no Hadoop required).
- Or start the HDFS containers: `docker compose up namenode datanode -d` and wait for the NameNode healthcheck to pass.

**App shows blank page**
- Check browser console for errors.
- Confirm backend is running: `curl http://localhost:5000/api/health`
- Confirm `frontend/.env` has `REACT_APP_API_URL=http://localhost:5000`.

**AI Detection returns "AI Service is unavailable"**
- Start the AI service: `uvicorn main:app --host 0.0.0.0 --port 8001`
- Check `AI_SERVICE_URL=http://localhost:8001` is set in `backend/.env`.

---

## License

MIT — see [LICENSE](LICENSE)

---

**Version:** 1.2.0 | **Last Updated:** 2026-05-02

### Latest Model Update (May 2, 2026)
- ✅ Retrained ensemble with 20-feature LR pipeline
- ✅ Enhanced with spaCy NLP (4 features) and semantic embeddings (3 features)
- ✅ RoBERTa 90% / LR 10% weights (tuned on HC3 val, reported on held-out domains)
- **Latest LR Metrics:** Accuracy 87.97%, F1 0.8813, ROC-AUC 0.9505
- **Training Dataset:** 150k+ balanced modern_llm_corpus samples (80% of full dataset)
- **Feature Pipeline:** 13 statistical + 4 spaCy + 3 semantic = 20 total
