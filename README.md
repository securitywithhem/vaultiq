# VaultIQ — Secure Distributed Cloud Storage System

VaultIQ is a full-stack, production-grade document storage platform with end-to-end AES-256 encryption, AI-powered plagiarism and AI-content detection, and a Big Data analytics pipeline built on Apache Hadoop + Spark.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Prerequisites](#prerequisites)
7. [Environment Setup](#environment-setup)
8. [How to Run](#how-to-run)
9. [API Reference](#api-reference)
10. [Data Flow](#data-flow)
11. [Security Model](#security-model)
12. [Big Data Pipeline](#big-data-pipeline)

---

## Overview

VaultIQ lets users securely upload, store, download, and analyse documents. Every file is encrypted before storage and kept in AWS S3. The platform provides:

- **Encrypted file vault** — AES-256-CBC encryption with per-file random IVs and SHA-256 integrity verification on every download
- **AI Integrity Search** — plagiarism detection using SBERT + FAISS semantic similarity
- **AI Content Detection** — distinguishes human-written vs AI-generated text using an ensemble of DistilBERT + Random Forest
- **Big Data Analytics** — event logs streamed to HDFS, processed by Apache Spark, visualised in a live dashboard

---

## Architecture

The system is composed of three independent services that communicate over HTTP:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser  (React + React Router)                                    │
│                                                                     │
│  Login / Register → Dashboard → Analytics → Plagiarism Checker     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP  (JWT in HttpOnly cookie)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Backend — Node.js / Express 5   (port 5000)                        │
│                                                                     │
│  /api/auth        → register, login, logout, refresh token          │
│  /api/files       → upload (encrypt→S3), list, download, delete     │
│  /api/plagiarism  → proxies to AI service /detect                   │
│  /api/ai-detect   → proxies to AI service /detect/file & /detect    │
│  /api/analytics   → reads Spark results from HDFS (+ cache)         │
│                                                                     │
│  Supabase (auth + metadata DB)      AWS S3 (encrypted file storage) │
│  HDFS event logging                 Supabase fallback logging        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP  (internal)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AI Service — Python / FastAPI   (port 8001)                        │
│                                                                     │
│  POST /detect        → plagiarism + AI detection on text            │
│  POST /detect/file   → extract text from PDF/DOCX, then /detect     │
│  POST /corpus/add    → add document to FAISS plagiarism index       │
│  GET  /health        → liveness probe                               │
│                                                                     │
│  Models: SBERT (all-MiniLM-L6-v2), FAISS, DistilBERT, RandomForest │
└─────────────────────────────────────────────────────────────────────┘

Big Data Pipeline  (optional, Docker):
  Upload/Download/Delete events
      → HDFS  (/vaultiq/logs/)
      → Spark  analytics_job.py
      → HDFS results  (/vaultiq/results/)
      → Backend /api/analytics  reads + serves to dashboard
```

---

## Features

| Feature | Description |
|---|---|
| Secure Registration / Login | Email + password auth via Supabase; JWT stored in `HttpOnly SameSite=Strict` cookies; token refresh rotation |
| Account Lockout | 5 failed logins → 15-min lockout with email security alert |
| File Upload | AES-256-CBC encryption, random IV per file, SHA-256 hash for integrity; stored in AWS S3 |
| File Download | Stream-mode decryption for large files; integrity re-verified before delivery |
| File Delete | S3 + Supabase metadata removed atomically |
| Plagiarism Detection | SBERT sentence embeddings → FAISS similarity search; windowed scoring |
| AI Content Detection | GPT-2 perplexity + burstiness features + DistilBERT ensemble |
| Big Data Analytics | 7 Spark analytics (daily trend, top files, event breakdown, anomaly detection…) |
| HDFS Audit Logging | Every upload/download/delete logged to HDFS; falls back to Supabase |
| Rate Limiting | Per-route limiters: 10 auth/15min, 100 uploads/hr, 60 file ops/min |

---

## Tech Stack

### Frontend
- React 19, React Router 6, Axios
- Recharts (analytics charts), React Hot Toast, React Dropzone
- CSS Modules

### Backend
- Node.js, Express 5
- JWT (`jsonwebtoken`), `helmet`, `express-rate-limit`, `compression`
- Supabase JS SDK, AWS SDK v3 (`@aws-sdk/client-s3`)
- `multer` (file upload), `nodemailer` (email alerts), `winston` (structured logging)

### AI Service
- Python 3.11, FastAPI, Uvicorn
- HuggingFace Transformers (`distilbert-base-uncased`, `all-MiniLM-L6-v2`, `gpt2`)
- `faiss-cpu`, `scikit-learn`, `sentence-transformers`
- `pdfplumber`, `python-docx` (text extraction from PDF/DOCX)

### Infrastructure
- Supabase (PostgreSQL + Auth)
- AWS S3 (file storage with server-side AES256)
- Apache Hadoop 3 (HDFS — event log storage)
- Apache Spark 3 (batch analytics)
- Docker + Docker Compose

---

## Project Structure

```
vaultiq/
├── frontend/                    # React application
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── Navbar.jsx
│   │   │   ├── FileCard.jsx
│   │   │   ├── UploadZone.jsx
│   │   │   ├── EmptyState.jsx
│   │   │   ├── HashBadge.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   └── ProtectedRoute.jsx
│   │   ├── pages/               # Route-level page components
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx        # File vault
│   │   │   ├── Analytics.jsx        # Big Data dashboard
│   │   │   └── PlagiarismChecker.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx      # Global auth state
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   └── useFiles.js
│   │   ├── services/
│   │   │   ├── api.js               # Axios instance + interceptors
│   │   │   ├── authService.js
│   │   │   ├── fileService.js
│   │   │   └── plagiarismService.js
│   │   ├── styles/
│   │   │   └── global.css
│   │   └── utils/
│   │       └── format.js
│   ├── public/
│   └── package.json
│
├── backend/                     # Node.js Express API
│   ├── routes/
│   │   ├── auth.js              # Register, login, logout, refresh
│   │   ├── files.js             # Upload, list, download, delete
│   │   ├── analytics.js         # Reads Spark results from HDFS
│   │   ├── plagiarism.js        # Proxies to AI service /detect
│   │   └── aiDetector.js        # Proxies to AI service /detect/file
│   ├── middleware/
│   │   ├── auth.js              # JWT verification middleware
│   │   ├── validate.js          # Joi request validation middleware
│   │   └── requestId.js         # Unique request ID injection
│   ├── utils/
│   │   ├── crypto.js            # AES-256-CBC encrypt/decrypt, SHA-256
│   │   ├── s3.js                # AWS S3 upload/download/delete
│   │   ├── supabase.js          # Supabase clients (admin + anon)
│   │   ├── hdfsLogger.js        # HDFS event logging + Supabase fallback
│   │   ├── accountLockout.js    # Failed-login tracking + lockout
│   │   ├── emailService.js      # Nodemailer (security alerts)
│   │   └── logger.js            # Winston structured logger
│   ├── validators/              # Joi schemas per route
│   │   ├── auth.schema.js
│   │   ├── files.schema.js
│   │   ├── plagiarism.schema.js
│   │   └── aiDetector.schema.js
│   ├── scripts/
│   │   ├── spark-jobs/          # PySpark analytics jobs
│   │   │   ├── analytics_job.py     # Master job (runs all analytics)
│   │   │   ├── usage_analytics.py
│   │   │   ├── storage_stats.py
│   │   │   └── ai_trends.py
│   │   ├── migrations/
│   │   │   └── 001_add_indexes.sql
│   │   ├── process_logs.py      # Python MapReduce fallback
│   │   ├── setup.sql            # Initial DB schema
│   │   ├── benchmark.js         # Load testing script
│   │   └── check_user.js        # Dev utility: lookup user in Supabase
│   ├── tests/
│   │   └── test_spark_job.py
│   ├── server.js                # Express app entry point
│   ├── .env.example
│   └── package.json
│
├── ai_service/                  # Python FastAPI AI microservice
│   ├── models/
│   │   ├── plagiarism_model.py      # SBERT + FAISS index
│   │   └── ai_detector_model.py     # DistilBERT + RandomForest ensemble
│   ├── services/
│   │   ├── plagiarism_service.py    # Detection orchestration
│   │   ├── ai_detection_service.py  # Detection orchestration
│   │   ├── feature_extractor.py     # GPT-2 perplexity, burstiness, entropy
│   │   ├── preprocessor.py          # Text tokenisation and cleaning
│   │   └── text_extractor.py        # PDF/DOCX → plain text
│   ├── training/
│   │   ├── train_distilbert.py      # Fine-tune DistilBERT
│   │   ├── train_random_forest.py   # Train RF classifier
│   │   └── data_loader.py
│   ├── schemas/
│   │   └── request_response.py      # Pydantic v2 models
│   ├── utils/
│   │   └── helpers.py
│   ├── data/                        # FAISS index + corpus metadata (gitignored)
│   ├── config.py                    # All thresholds, model paths, hyperparams
│   ├── main.py                      # FastAPI app entry point
│   └── requirements.txt
│
├── docker-compose.yml           # Full stack (backend + Hadoop + Spark)
├── hadoop.env                   # Hadoop environment config
├── start.sh                     # Local dev startup script
├── validate_setup.sh            # Health-check script
├── DATABASE_RLS_SETUP.sql       # Supabase Row-Level Security policies
├── .env.example                 # Root env template
├── .gitignore
└── README.md
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | >= 18 | Backend + Frontend |
| Python | >= 3.11 | AI Service |
| npm | >= 9 | Package management |
| Docker + Docker Compose | latest | Hadoop / Spark stack (optional) |
| AWS account | — | S3 bucket |
| Supabase project | — | Auth + metadata DB |

---

## Environment Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd vaultiq

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# AI Service
cd ai_service
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# Server
PORT=5000
NODE_ENV=development

# Security
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<64-char-random-string>
# Must be exactly 64 hex characters (= 32 bytes)
ENCRYPTION_KEY=<64-hex-chars>

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=ap-south-1
S3_BUCKET_NAME=your-bucket-name

# AI Service
AI_SERVICE_URL=http://localhost:8001

# HDFS (only needed with Docker big-data stack)
HDFS_WEBHDFS_URL=http://localhost:9870/webhdfs/v1
HDFS_ENABLED=false          # set true when running Docker stack
```

### 3. Supabase database setup

Run `backend/scripts/setup.sql` in your Supabase SQL editor (creates `files`, `profiles`, `login_attempts`, `event_logs` tables).

For Row-Level Security run `DATABASE_RLS_SETUP.sql`.

---

## How to Run

### Option A — Local Development (recommended for development)

```bash
./start.sh
```

This starts all three services:

| Service | URL |
|---|---|
| React Frontend | http://localhost:3000 |
| Express Backend | http://localhost:5000 |
| FastAPI AI Service | http://localhost:8001/docs |

Verify everything is reachable:

```bash
./validate_setup.sh
```

### Option B — Full Docker Stack (includes Hadoop + Spark)

```bash
docker compose up -d
```

Containers started:

| Container | Port | Purpose |
|---|---|---|
| `backend` | 5000 | Express API |
| `ai-service` | 8001 | FastAPI AI |
| `namenode` | 9870 | HDFS NameNode + WebHDFS UI |
| `datanode` | — | HDFS DataNode |
| `spark-master` | 8080 | Spark Web UI |
| `spark-worker` | — | Spark executor |

Set `HDFS_ENABLED=true` in `backend/.env` so event logs go to HDFS.

Start the frontend separately:
```bash
cd frontend && npm start
```

### Running Spark analytics manually

```bash
docker exec spark-master spark-submit \
  --master local[*] \
  /opt/spark-jobs/analytics_job.py
```

Or click **"Run Spark Job"** from the Analytics page (triggers the Python fallback).

---

## API Reference

All endpoints are prefixed with `/api`. Authentication uses JWT in HttpOnly cookies (set automatically on login).

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create account, sets JWT cookies |
| POST | `/login` | — | Authenticate, sets JWT cookies |
| GET | `/me` | Required | Get current user info |
| POST | `/logout` | — | Clear JWT cookies |
| POST | `/refresh` | — | Rotate access + refresh tokens |

### Files — `/api/files`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/upload` | Required | Upload and encrypt a file (multipart/form-data) |
| GET | `/` | Required | List all files for current user |
| GET | `/:id/download` | Required | Decrypt and download a file |
| DELETE | `/:id` | Required | Delete from S3 and metadata |

Accepted file types: `pdf`, `docx`, `txt`, `md`, `rtf` (max 50 MB)

### Plagiarism — `/api/plagiarism`

| Method | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/check` | Required | `{ text }` | Run plagiarism + AI detection |
| POST | `/add` | Required | `{ doc_id, text }` | Add document to FAISS corpus |

### AI Detection — `/api/ai-detect`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/check` | Required | Upload PDF/DOCX for detection (multipart) |
| POST | `/check-text` | Required | Detect AI content in text body |
| GET | `/status` | — | Check if AI service is online |

### Analytics — `/api/analytics`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Required | 7 Spark analytics results |
| POST | `/refresh` | Required | Trigger analytics re-computation |

### System

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Uptime, memory, timestamp |

---

## Data Flow

### File Upload

```
1. User selects file in UploadZone (drag-and-drop)
2. Frontend: POST /api/files/upload  (multipart, 50 MB limit)
3. Backend validates MIME type and extension (whitelist)
4. Generate random 16-byte IV
5. AES-256-CBC encrypt(fileBuffer, IV)
6. Prepend IV to ciphertext → single encrypted blob
7. PUT encrypted blob to S3 (+ server-side AES256)
8. INSERT metadata into Supabase: filename, s3_key, sha256_hash, file_size
9. Fire-and-forget: log event to HDFS (or Supabase fallback)
10. Return file record → frontend optimistic list update
```

### File Download

```
1. User clicks Download on a FileCard
2. GET /api/files/:id/download  (IDOR-protected: user_id filter at DB level)
3. Fetch encrypted blob from S3
4. Large file (>10 MB):
     IVExtractorStream reads first 16 bytes → creates AES decipher
     Remaining ciphertext pipes through decipher → pipes to HTTP response
5. Small file:
     Buffer entire blob → slice IV (bytes 0–15) → AES decrypt
     SHA-256 hash plaintext → compare to stored hash
     If mismatch → 409 Conflict (integrity failure)
     Send plaintext to browser
```

### Plagiarism + AI Detection

```
1. User pastes text → clicks "Run Deep Scan"
2. POST /api/plagiarism/check { text }
3. Backend proxies → POST http://ai-service:8001/detect { text, document_id }
4. AI service pipeline:
   a. Preprocess: sentence-split, clean tokens
   b. Plagiarism: SBERT embed → FAISS cosine search → windowed score
   c. AI detection:
      - GPT-2 perplexity (low = AI-like)
      - Burstiness / entropy of sentence lengths
      - Random Forest on extracted features
      - DistilBERT binary classifier (fine-tuned)
      - Weighted ensemble: 40% RF + 60% DistilBERT
   d. Combine into overall risk score
5. Return DetectionResponse:
   { plagiarism: { score, verdict, matched_segments },
     ai_detection: { probability, verdict, features },
     overall: { risk_score, verdict, processing_time_ms } }
6. Frontend renders similarity % and verdict
```

### Analytics Pipeline

```
Events:
  Every upload/download/delete
    → hdfsLogger.logEvent()  [fire-and-forget, never blocks response]
    → WebHDFS PUT /vaultiq/logs/{timestamp}_{event}_{user_id}.json
    → On HDFS failure: Supabase event_logs table (fallback)

Spark batch job (manual or via UI button):
  docker exec spark-master spark-submit /opt/spark-jobs/analytics_job.py
    → Reads all logs from HDFS /vaultiq/logs/
    → Computes 7 analytics and writes to /vaultiq/results/

Backend GET /api/analytics:
  → For each of 7 analytics: read HDFS result folder via WebHDFS
  → On any HDFS read failure: fall back to analytics_cache/{name}.json
  → Return unified object to frontend

Dashboard renders:
  - Area chart: daily upload trend (7d / 14d / 30d filter)
  - Horizontal bar: top 10 downloaded files
  - Donut pie: event type breakdown (upload / download / delete)
  - Bar chart: hourly activity (off-hours highlighted in red)
  - Anomaly alerts: users with >5 off-hours events on a single day
  - Status grid: NameNode, DataNode, Spark, results source
```

---

## Security Model

| Concern | Implementation |
|---|---|
| Authentication | JWT in `HttpOnly; SameSite=Strict; Secure` cookies — inaccessible to JavaScript |
| Token rotation | Refresh tokens rotate on every use; access tokens expire in 1 hour |
| CORS | Whitelist-only origin check + `credentials: true` |
| CSRF | Mitigated by `SameSite=Strict` + CORS origin allowlist (no token needed) |
| File encryption | AES-256-CBC, random 16-byte IV per file, IV prepended to ciphertext |
| Integrity | SHA-256 hash stored at upload time, verified on every download |
| IDOR protection | All file queries filter by `user_id` at the PostgreSQL level |
| Rate limiting | 10 auth/15min · 100 uploads/hr · 60 file-ops/min · 1000 global/15min |
| Account lockout | 5 failed logins → 15-min lockout + email security alert |
| Input validation | Joi schemas on every route; MIME type + extension allowlist |
| Security headers | Helmet: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Error responses | Stack traces never sent to clients; all errors normalised server-side |

---

## Big Data Pipeline

The analytics pipeline is optional for local development — the dashboard shows empty charts until Spark has run at least once.

### Spark jobs (`backend/scripts/spark-jobs/`)

| File | Output |
|---|---|
| `analytics_job.py` | Master job — runs all analytics in one Spark session |
| `usage_analytics.py` | Daily upload trend, event breakdown |
| `storage_stats.py` | Per-user storage totals |
| `ai_trends.py` | Hourly activity pattern, anomaly detection (off-hours) |

### Python MapReduce fallback

When Spark is unavailable, `backend/scripts/process_logs.py` reads events from the Supabase `event_logs` table and writes `backend/analytics_cache/*.json`. The backend's analytics route falls back to these files automatically.

### HDFS paths

```
/vaultiq/logs/            ← raw event logs  (one JSON per event)
/vaultiq/results/         ← Spark output folders
  daily_trend/part-*
  top_files/part-*
  user_storage/part-*
  event_breakdown/part-*
  hourly_pattern/part-*
  platform_totals/part-*
  anomalies/part-*
```
