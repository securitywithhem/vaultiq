# VaultIQ — Secure Zero-Knowledge Storage with AI Analytics

VaultIQ is a production-grade secure document management system designed to protect sensitive information using a zero-knowledge architecture. It features integrated AI content detection, plagiarism analysis, and a big-data analytics pipeline powered by Hadoop and Spark.

## 🚀 Key Features

*   **Zero-Knowledge Encryption**: AES-256-GCM encryption with client-side key derivation (planned) or high-security server-side encryption (current).
*   **AI Content Detection**: Distinguish between human-written and AI-generated documents (Random Forest classifier).
*   **Plagiarism Engine**: Real-time similarity analysis against a dynamic corpus (TF-IDF, Cosine Similarity, Jaccard Index).
*   **Big Data Analytics**: Multi-stage log processing using Hadoop HDFS for storage and Apache Spark for trend analysis.
*   **Production Infrastructure**: Fully containerized orchestration with Nginx reverse proxy, PostgreSQL, and Redis caching.

## 🏗️ Architecture Overwiew

- **Frontend**: React (Vite) + Tailwind CSS
- **Backend API**: Node.js (Express) + JWT + Supabase Auth
- **AI Service**: Python (FastAPI) + Scikit-Learn
- **Storage Layer**: AWS S3 (Documents) + PostgreSQL (Metadata)
- **Analytics Cluster**: Apache Hadoop (HDFS) + Apache Spark
- **Proxy/Cache**: Nginx + Redis

## 🛠️ Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.10+ (for local AI service development)

### 2. Environment Setup
Copy the example environment files and fill in the missing credentials (AWS, Supabase):
```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

### 3. Running the Full Stack
Bring up all services using Docker:
```bash
docker-compose up -d --build
```

Access the application at [http://localhost](http://localhost).

## 📊 Analytics Pipeline
1.  **Logging**: All events are logged to HDFS in real-time.
2.  **Processing**: Spark jobs read from HDFS, calculate metrics, and write summaries back.
3.  **Visualization**: The backend serves summarized metrics to the React dashboard.

## 🔒 Security Model
VaultIQ uses a multi-layered security approach:
- **At-Rest**: S3 Server-Side Encryption (AES256)
- **In-Transit**: TLS/HTTPS + Nginx reverse proxy
- **Application**: Payload-level encryption with AES-256-CBC (to be upgraded to GCM)

## 📜 License
MIT License - 2026 VaultIQ Team
