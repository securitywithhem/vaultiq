# VaultIQ 🛡️

**VaultIQ** is an advanced, production-grade secure document management system. Designed to protect sensitive information, VaultIQ leverages a multi-layered security architecture alongside integrated AI capabilities and a big-data analytics pipeline. It offers users a fortified, zero-knowledge-oriented platform to store, manage, and analyze documents intelligently.

## 🌟 Key Features

*   **Bank-Grade Security**: Payload-level **AES-256-CBC/GCM** encryption (IV prepended) and AWS S3 Server-Side Encryption (SSE-AES256).
*   **Secure Authentication**: JWT-based auth utilizing `httpOnly` & `SameSite=Strict` cookies to completely neutralize XSS vulnerabilities.
*   **Adaptive Threat Protection**: Built-in per-endpoint rate limiting, brute-force account lockout mechanisms, and Supabase Row-Level Security (RLS).
*   **AI Content Detection**: A dedicated microservice utilizing **DistilBERT** & **Random Forest** to distinguish between human-written and AI-generated documents.
*   **Plagiarism Tracking**: Real-time semantic similarity analysis against a dynamic corpus utilizing FAISS, TF-IDF, and Cosine Similarity.
*   **Big Data Analytics Pipeline**: Fault-tolerant event logging via **Apache Hadoop (HDFS)** and high-speed data processing via **Apache Spark (PySpark)** for system auditing and trend analysis.
*   **Modern Interactive Dashboard**: High-fidelity React (Vite) frontend with Tailwind CSS, offering a responsive "Command Center" aesthetic for tracking activity timelines and storage heatmaps.

## 🏗️ System Architecture

VaultIQ orchestrates multiple services through a robust containerized infrastructure:

| Component | Technology Stack |
| :--- | :--- |
| **Frontend** | React (Vite), Tailwind CSS, Recharts |
| **Backend API** | Node.js (Express.js), JWT, Helmet |
| **AI Microservice** | Python (FastAPI), Scikit-Learn, Hugging Face, FAISS |
| **Storage & Database** | AWS S3, PostgreSQL (Supabase) |
| **Analytics Engine** | Apache Hadoop (HDFS), Apache Spark |
| **Orchestration** | Docker, Docker Compose |

---

## 🔒 Security Posture

VaultIQ takes security seriously. Recent hardening implementations include:
- **Authentication**: JWTs are never exposed to `localStorage`. Access (1h) and Refresh (7d) tokens are strictly managed via secure HTTP-only cookies.
- **Data at Rest**: Files are encrypted chunk-by-chunk in memory before hitting the S3 bucket; AES Initialization Vectors (IVs) are securely prepended to ciphertexts. S3 strictly mandates SSE-AES256.
- **Data in Transit**: HTTPS/TLS redirect enabled; strict HSTS, CSP, and X-Frame-Options headers applied via Helmet.
- **Data Validation**: Strict MIME-type checking, UUID-based file naming to prevent directory traversal, and 50MB upload limits.
- **Access Control**: Database queries deeply enforce Supabase Row-Level Security (RLS). Insecure Direct Object References (IDORs) are fundamentally mitigated.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Node.js 18+ (for local development)
- Python 3.10+ (for local AI service development)

### 2. Environment Configuration
Clone the repository and set up your environment variables. 
Copy the `.env.example` templates and populate them with your specific credentials (e.g., Supabase keys, AWS credentials, JWT Secret):

```bash
# VaultIQ Root
cp .env.example .env

# Backend
cp backend/.env.example backend/.env
```

*Note: Ensure your `backend/.env` file contains a highly secure 64-character hex `ENCRYPTION_KEY`.*

### 3. Database Setup (Supabase)
Navigate to your Supabase SQL editor and execute the contents of `vaultiq/DATABASE_RLS_SETUP.sql`. This will initialize the tables for `files`, `login_attempts`, and apply the necessary RLS policies enforcing data isolation.

### 4. Running the Full Stack
VaultIQ uses Docker Compose to seamlessly orchestrate the Node.js backend, React frontend, Python AI service, and Big Data mock instances.

```bash
# Build and start all containers in detached mode
docker-compose up -d --build
```

- **Frontend Application**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **AI Service Docs**: [http://localhost:8001/docs](http://localhost:8001/docs)

### 5. Managing the Analytics Pipeline
VaultIQ's telemetry continuously logs structured event data to HDFS. To process trends:
- The system utilizes Apache Spark mapped to `scripts/spark_analytics.py` for distributed MapReduce operations.
- Aggregated intelligence (e.g., user activity metrics, capacity footprint, security insights) is synchronized and served directly to the React Analytics Dashboard.

---

## 🛠️ Development & Contribution

- **Backend**: Found in the `backend/` directory. Use `npm run dev` for nodemon hot-reloading.
- **Frontend**: Found in the `frontend/` directory. Use `npm run dev` for Vite hot-reloading.
- **AI Service**: Found in `ai_service/`. Models and FAISS indexes are stored locally; review the AI specific requirements format.

## 📜 License
MIT License - © 2026 VaultIQ Team
