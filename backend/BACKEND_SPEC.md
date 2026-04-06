# VaultIQ Backend API Specification

> **Version:** 1.0.0  
> **Base URL:** `http://localhost:5000/api`  
> **Auth:** JWT via `HttpOnly` cookies (`SameSite=Strict`)

---

## Architecture Overview

```
Client → CORS → Helmet → Request-ID → Rate Limiter → Route → Auth Middleware → Handler → Response
                                                                      ↓
                                                        S3 (encrypted storage)
                                                        Supabase (metadata DB)
                                                        HDFS (event logs)
                                                        AI Service (plagiarism/detection)
```

### Security Stack
| Layer | Implementation |
|-------|---------------|
| Transport | HTTPS redirect (prod), HSTS preload |
| Headers | Helmet (CSP, X-Frame-Options, noSniff, referrer-policy) |
| CORS | Origin whitelist with credentials |
| Auth | JWT access (1h) + refresh (7d) in HttpOnly/SameSite=Strict cookies |
| Rate Limiting | Global (1000/15min), auth (10/15min), upload (100/hr), file ops (60/min) |
| Encryption | AES-256-CBC with prepended IV, S3 SSE-AES256 |
| IDOR | Query-level `user_id` filtering on all file operations |
| Input | Joi schema validation on all endpoints |
| Lockout | 5 failed logins → 15 min lockout + email alert |

---

## Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | ❌ | System health with uptime & memory |

**Response `200`:**
```json
{
  "data": {
    "status": "ok",
    "timestamp": "2026-04-07T00:00:00.000Z",
    "uptime": 3600,
    "memory": "45MB"
  }
}
```

---

### Authentication (`/api/auth`)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/auth/register` | ❌ | 10/15min | Register new user |
| `POST` | `/auth/login` | ❌ | 10/15min | Login (sets cookies) |
| `GET` | `/auth/me` | ✅ | — | Get current user |
| `POST` | `/auth/logout` | ❌ | — | Clear auth cookies |
| `POST` | `/auth/refresh` | ❌ | — | Rotate access + refresh tokens |

#### `POST /auth/register`
**Body:**
```json
{
  "email": "user@example.com",    // required, valid email
  "password": "securepass123",    // required, min 8 chars
  "fullName": "John Doe"          // required, max 100 chars
}
```
**Success `201`:** `{ "data": { "user": { "id", "email", "fullName" } } }`  
**Errors:** `400` validation, `409` email exists

#### `POST /auth/login`
**Body:**
```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```
**Success `200`:** `{ "data": { "user": { "id", "email" } } }`  
**Errors:** `401` invalid credentials, `423` account locked

#### `POST /auth/refresh`
Uses `vaultiq_refresh_token` cookie. Issues new access + refresh token pair (rotation).

---

### Files (`/api/files`)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/files/upload` | ✅ | 60/min | Upload & encrypt file |
| `GET` | `/files` | ✅ | 60/min | List user's files |
| `GET` | `/files/:id/download` | ✅ | 60/min | Download & decrypt file |
| `DELETE` | `/files/:id` | ✅ | 60/min | Delete file |

#### `POST /files/upload`
**Content-Type:** `multipart/form-data`  
**Field:** `file` (max 50MB)  
**Allowed types:** PDF, DOCX, DOCM, TXT, MD, RTF

**Success `201`:**
```json
{
  "data": {
    "file": {
      "id": "uuid",
      "filename": "report.pdf",
      "file_size": 1048576,
      "uploaded_at": "2026-04-07T00:00:00.000Z",
      "sha256_hash": "abc123..."
    }
  }
}
```

#### `GET /files/:id/download`
**Params:** `id` must be valid UUID  
**Response:** Binary file stream with `Content-Disposition: attachment`  
**Modes:**
- **< 10MB:** Buffered decrypt + SHA-256 integrity check
- **≥ 10MB:** Streaming decrypt (IV extracted from first 16 bytes of stream)

#### `DELETE /files/:id`
**Params:** `id` must be valid UUID  
**Success `200`:** `{ "data": { "message": "File deleted" } }`

---

### Analytics (`/api/analytics`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/analytics` | ✅ | Fetch aggregated analytics from HDFS |
| `POST` | `/analytics/refresh` | ✅ | Trigger background log processing |

---

### Plagiarism Detection (`/api/plagiarism`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/plagiarism/check` | ✅ | Check text for similarity |
| `POST` | `/plagiarism/add` | ✅ | Add document to corpus |

#### `POST /plagiarism/check`
**Body:** `{ "text": "document content..." }` (max 100K chars)

#### `POST /plagiarism/add`
**Body:** `{ "doc_id": "doc-123", "text": "document content..." }`

---

### AI Content Detection (`/api/ai-detect`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/ai-detect/train` | ✅ | Train the detection model |
| `POST` | `/ai-detect/check` | ✅ | Detect AI content in uploaded file |
| `POST` | `/ai-detect/check-text` | ✅ | Detect AI content in raw text |
| `GET` | `/ai-detect/status` | ❌ | AI service health check |

---

## Response Envelope

All responses follow a consistent format:

```json
// Success
{ "data": { ... } }

// Error
{ "error": "Human-readable error message" }

// Validation Error
{
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "Valid email is required" }
  ]
}
```

## HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `202` | Accepted (async job started) |
| `400` | Validation / bad request |
| `401` | Token missing / expired |
| `403` | Invalid token / forbidden |
| `404` | Not found |
| `409` | Conflict (duplicate, integrity) |
| `413` | File too large |
| `423` | Account locked |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `502` | AI service unreachable |

---

## Observability

- **Request IDs:** Every request gets a UUID (`X-Request-ID` header)
- **Structured Logging:** Winston with JSON format (prod) / colored (dev)
- **Log Levels:** error, warn, info, debug (configurable via `LOG_LEVEL` env)
- **Event Audit:** All file operations logged to HDFS with Supabase fallback

---

## File Structure

```
backend/
├── server.js                    # Express app + middleware chain
├── middleware/
│   ├── auth.js                  # JWT authentication
│   ├── requestId.js             # Request ID + timing
│   └── validate.js              # Joi validation factory
├── routes/
│   ├── auth.js                  # Register, login, logout, refresh
│   ├── files.js                 # Upload, list, download, delete
│   ├── analytics.js             # HDFS analytics
│   ├── plagiarism.js            # AI plagiarism proxy
│   └── aiDetector.js            # AI content detection proxy
├── utils/
│   ├── logger.js                # Winston logger
│   ├── crypto.js                # AES-256-CBC encrypt/decrypt
│   ├── s3.js                    # S3 upload/download/delete
│   ├── supabase.js              # Supabase client init
│   ├── hdfsLogger.js            # HDFS event logger + fallback
│   ├── accountLockout.js        # Login attempt tracking
│   └── emailService.js          # Nodemailer service
├── validators/
│   ├── auth.schema.js           # Auth Joi schemas
│   ├── files.schema.js          # Files Joi schemas
│   ├── plagiarism.schema.js     # Plagiarism Joi schemas
│   └── aiDetector.schema.js     # AI detector Joi schemas
└── scripts/
    └── migrations/
        └── 001_add_indexes.sql  # Database index migration
```
