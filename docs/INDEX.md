# VaultIQ Documentation Index

Welcome to VaultIQ! This document helps you navigate all the project documentation.

---

## 🚀 Getting Started (Start Here!)

**[← Back to README.md](../README.md)**

The main README contains:
- Project overview and features
- Architecture diagrams
- Tech stack explanation
- How to run the project
- API reference summary
- Security model
- Troubleshooting

---

## 📚 Documentation Structure

```
docs/
├── INDEX.md ...................... (you are here)
├── architecture/
│   └── ai-detection.md ........... AI detection pipeline technical spec
└── api/
    └── backend-api.md ............ Complete REST API reference
```

---

## 🎯 Find Documentation By Role

### **For Project Managers / Non-Technical**
1. Start with [README.md](../README.md) — Overview, features, tech stack explained simply
2. Architecture diagrams show how everything connects
3. [API Reference](../README.md#api-reference) section shows what the system can do

### **For Frontend Developers**
1. [README.md](../README.md#how-to-run) — Setup and startup instructions
2. [Backend API Reference](api/backend-api.md) — All endpoints your frontend uses
3. Check `/frontend` folder for React components and hooks

### **For Backend Developers**
1. [README.md - Environment Setup](../README.md#environment-setup) — Configure .env
2. [Backend API Specification](api/backend-api.md) — Detailed endpoint docs, security, rate limits
3. Check `/backend` folder for Express routes, middleware, utils

### **For AI/ML Engineers**
1. [AI Detection Technical Spec](architecture/ai-detection.md) — RoBERTa, LR, features, thresholds
2. `/ai-service/train_lr.py` — Training script for retraining models
3. `/ai-service/detector.py` — Main ensemble scoring logic

### **For DevOps / Infrastructure**
1. [README.md - Prerequisites](../README.md#prerequisites) — OS dependencies
2. [README.md - Environment Setup](../README.md#environment-setup) — .env configuration
3. `docker-compose.yml` — Full stack orchestration
4. `/start.sh` — Bash orchestration script for local development

### **For Security / Compliance**
1. [README.md - Security Model](../README.md#security-model) — Encryption, auth, rate limiting
2. Check how files are encrypted (backend/utils/crypto.js)
3. JWT implementation details (backend/middleware/auth.js)
4. HDFS audit logging (backend/utils/hdfsLogger.js)

---

## 📖 Documentation Files

### **Main Documentation**

| File | Purpose | Audience |
|------|---------|----------|
| [README.md](../README.md) | Complete project overview with setup, features, architecture | Everyone |
| [CLAUDE.md](../CLAUDE.md) | Claude Code integration instructions | Developers using Claude |

### **Architecture & Technical Specs**

| File | Purpose | Audience |
|------|---------|----------|
| [ai-detection.md](architecture/ai-detection.md) | AI ensemble pipeline architecture, RoBERTa + LR + feature engineering | ML engineers, architects |
| [backend-api.md](api/backend-api.md) | Complete REST API specification with request/response examples | All backend developers |

---

## 🔑 Key Features Documented

### **Encryption & Security**
- Read: [README.md - Security Model](../README.md#security-model)
- Implementation: `backend/utils/crypto.js`

### **AI Content Detection**
- Read: [ai-detection.md](architecture/ai-detection.md)
- Implementation: `ai-service/detector.py`
- Training: `ai-service/train_lr.py`

### **API Endpoints**
- Read: [backend-api.md](api/backend-api.md)
- Implementation: `backend/routes/`

### **Authentication**
- Read: [backend-api.md - Auth endpoints](api/backend-api.md#authentication)
- Implementation: `backend/middleware/auth.js`

### **File Upload & Storage**
- Read: [README.md - API Reference](../README.md#api-reference)
- Implementation: `backend/utils/s3.js`, `backend/routes/files.js`

### **Analytics & Big Data**
- Read: [README.md - Architecture Overview](../README.md#architecture-overview) (Big Data Pipeline Flow)
- Implementation: `bigdata/analytics_job.py`, `bigdata/run_analytics.sh`

---

## ❓ Common Questions

### **"How do I set up the project?"**
→ [README.md - Environment Setup](../README.md#environment-setup)

### **"How do I start everything?"**
→ [README.md - How to Run](../README.md#how-to-run)

### **"What are all the API endpoints?"**
→ [backend-api.md](api/backend-api.md)

### **"How does the AI detection work?"**
→ [ai-detection.md](architecture/ai-detection.md)

### **"Why did you choose this tech stack?"**
→ [README.md - Tech Stack & Why](../README.md#tech-stack--why-we-chose-it)

### **"How is security implemented?"**
→ [README.md - Security Model](../README.md#security-model)

### **"What are the system requirements?"**
→ [README.md - Prerequisites](../README.md#prerequisites)

### **"How do I deploy to production?"**
→ [README.md - Production Deployment](../README.md#production-deployment-docker)

### **"The service won't start, what's wrong?"**
→ [README.md - Troubleshooting](../README.md#troubleshooting)

---

## 🗺️ Project Navigation

```
vaultiq/
│
├── README.md ...................... START HERE
├── docs/
│   ├── INDEX.md ................... (you are here)
│   ├── architecture/
│   │   └── ai-detection.md ........ AI pipeline details
│   └── api/
│       └── backend-api.md ......... API reference
│
├── frontend/ ...................... React application
│   ├── src/
│   │   ├── components/ ............ UI components
│   │   ├── pages/ ................. Route pages
│   │   └── api/ ................... API integration
│
├── backend/ ....................... Node.js Express API
│   ├── routes/ .................... Endpoint handlers
│   ├── middleware/ ................ Auth, validation, logging
│   ├── utils/ ..................... Crypto, S3, HDFS, logger
│   └── migrations/ ................ Database schemas
│
├── ai-service/ .................... Python FastAPI
│   ├── detector.py ................ Ensemble scoring
│   ├── similarity.py .............. Plagiarism detection
│   ├── extractor.py ............... Text extraction
│   ├── train_lr.py ................ Model training
│   └── models/ .................... Trained models
│
├── bigdata/ ....................... Spark analytics
│   ├── analytics_job.py ........... Spark job
│   └── run_analytics.sh ........... Job orchestrator
│
└── start.sh ....................... Multi-service start script
```

---

## 💡 Quick References

### **Environment Variables**
See: [README.md - Environment Setup](../README.md#environment-setup)

### **Database Migrations**
Location: `backend/migrations/`

### **Python Dependencies**
- Frontend: `frontend/package.json`
- Backend: `backend/package.json`
- AI Service: `ai-service/requirements.txt`
- BigData: `bigdata/requirements.txt`

### **Docker Setup**
File: `docker-compose.yml`

### **Troubleshooting**
Section: [README.md - Troubleshooting](../README.md#troubleshooting)

---

## 📞 Support

For questions about:
- **Setup & deployment** → See [README.md](../README.md)
- **API usage** → See [backend-api.md](api/backend-api.md)
- **AI detection** → See [ai-detection.md](architecture/ai-detection.md)
- **Code implementation** → Check the corresponding source file

---

**Last Updated**: 2026-04-11  
**Status**: ✅ Complete & Ready
