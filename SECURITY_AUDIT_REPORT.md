# VaultIQ Security Audit Report

**Date**: April 23, 2026  
**Audit Scope**: Full-stack application including Frontend, Backend, AI-Service, BigData pipeline  
**Risk Level**: 🔴 **CRITICAL** (Dependency vulnerabilities present)

---

## Executive Summary

VaultIQ has **strong foundational security architecture** with proper authentication, encryption, and rate limiting. However, there are **critical dependency vulnerabilities** that must be resolved immediately before production deployment. The application handles sensitive data (encrypted files, student submissions) and requires urgent remediation.

**Critical Issues**: 1  
**High Issues**: 3  
**Medium Issues**: 4  
**Low Issues**: 2

---

## 🔴 CRITICAL VULNERABILITIES

### 1. **fast-xml-parser Dependency Chain Vulnerabilities**
**Severity**: 🔴 CRITICAL  
**Affected Components**: Backend (via @aws-sdk/client-s3)  
**Status**: Unresolved ❌

**Details**:
- **Multiple CVEs** in fast-xml-parser (≤5.6.0):
  - XML entity expansion attacks (XXE-like)
  - DoS via numeric entities
  - Stack overflow in XMLBuilder
  - Entity encoding bypass via regex injection
  - RangeError DoS numeric entities bug

**Affected Package Chain**:
```
@aws-sdk/client-s3@3.1024.0
  → @aws-sdk/core
  → @aws-sdk/xml-builder
  → fast-xml-parser (≤5.6.0) [VULNERABLE]
```

**Impact**: 
- Denial of Service attacks
- Potential data extraction via entity expansion
- Application crashes

**Remediation**:
```bash
# Option 1: Force upgrade AWS SDK
cd backend
npm audit fix --force

# Option 2: Manual upgrade
npm install @aws-sdk/client-s3@latest --save
```

**Risk**: Breaking changes possible but necessary. Test thoroughly after upgrade.

---

### 2. **Axios SSRF & Cloud Metadata Exfiltration**
**Severity**: 🔴 CRITICAL  
**Affected Components**: Backend (analytics.js), AI-Service  
**Status**: Unresolved ❌

**Details**:
```javascript
// File: backend/routes/analytics.js:47
const res = await axios.get(openUrl, {
  timeout: 10_000,
  maxRedirects: 5,
  responseType: 'text',
});
```

**Vulnerabilities in axios 1.0.0-1.14.0**:
- **GHSA-3p68-rc4w-qgx5**: NO_PROXY hostname normalization bypass → SSRF
- **GHSA-fvcv-3m26-pcqx**: Unrestricted cloud metadata exfiltration

**Attack Scenario**:
1. Attacker manipulates `HDFS_WEBHDFS_URL` or network requests
2. SSRF attack reaches internal services (AWS metadata endpoint)
3. Credentials leaked via header injection

**Remediation**:
```bash
cd backend
npm install axios@latest --save

# Minimum safe version: 1.7.5 (or 0.28.1 for older Node)
npm install axios@1.7.5 --save
```

---

## 🔴 HIGH SEVERITY ISSUES

### 3. **Unsafe JSON.parse() in Analytics Route**
**Severity**: 🔴 HIGH  
**File**: [backend/routes/analytics.js:53, 60](backend/routes/analytics.js#L53-L60)  
**Status**: Unresolved ❌

**Code**:
```javascript
// Line 53 - HDFS response
return JSON.parse(res.data);

// Line 60 - Local file
return JSON.parse(raw);

// Line 35 - AI detections
return JSON.parse(raw).detections || [];
```

**Risk**:
- No try-catch around JSON.parse()
- Malformed JSON crashes entire analytics endpoint
- If HDFS/local file is compromised, invalid JSON causes 500 error
- No input validation before parsing

**Impact**: 
- Denial of Service (application crash)
- Information disclosure (full stack trace in response)

**Remediation**:
```javascript
function safeJsonParse(data, fallback = {}) {
  try {
    return JSON.parse(data);
  } catch (err) {
    logger.error('JSON parse error', { error: err.message });
    return fallback;
  }
}

// Usage:
const analytics = safeJsonParse(raw, {});
const detections = safeJsonParse(raw, {}).detections || [];
```

---

### 4. **No Rate Limiting on Analytics Endpoint**
**Severity**: 🔴 HIGH  
**File**: [backend/server.js:118](backend/server.js#L118)  
**Status**: Unresolved ❌

**Code**:
```javascript
// No rate limiter applied!
app.use('/api/analytics', analyticsRoutes);

// Compare to protected endpoints:
app.use('/api/auth', applyRateLimit(authLimiter), authRoutes);      // 10 req/15min
app.use('/api/ai-detect', applyRateLimit(uploadLimiter), aiDetectionRoutes); // 100 req/hour
```

**Risk**:
- `/api/analytics` can be called unlimited times
- Each call may spawn background process (`spawn` in analytics.js:36)
- Resource exhaustion (process spawning DoS)
- HDFS/Supabase query flooding

**Attack**:
```bash
# Attacker floods analytics endpoint
while true; do curl http://localhost:5000/api/analytics; done
# Spawns unlimited background processes
```

**Remediation**:
```javascript
const analyticsLimiter = rateLimit({ 
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 10                      // 10 requests per hour
});

app.use('/api/analytics', applyRateLimit(analyticsLimiter), analyticsRoutes);
```

---

### 5. **Unvalidated File Extension Check in Submissions**
**Severity**: 🔴 HIGH  
**File**: [backend/routes/submissions.js:99-100](backend/routes/submissions.js#L99-L100)  
**Status**: Unresolved ❌

**Code**:
```javascript
const ext = (file.originalname.split(".").pop() || "").toLowerCase();
if (!allowedTypes.includes(ext)) {
```

**Vulnerabilities**:
1. **Case sensitivity bypass**: File extension splitting is case-dependent
   - `file.PDF` → `pdf` (passes)
   - But some systems see it as uppercase → fails validation
2. **Double extension attack**: `malicious.pdf.exe` → checks only `exe`
3. **No MIME type verification**: Only filename extension validated
4. **null byte injection**: `file.pdf\x00.exe` → splits to `exe`

**Attack Scenarios**:
```
1. Upload "malicious.pdf.zip" → checks ".zip" → passes if zip allowed
2. Upload "payload.pdf" with executable MIME type
3. System trusts filename, not actual content
```

**Remediation**:
```javascript
// 1. Add MIME type validation
const MIME_TYPES = {
  'pdf': 'application/pdf',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'txt': 'text/plain'
};

// 2. Validate both extension AND MIME type
const ext = path.extname(file.originalname).toLowerCase().slice(1);
if (!allowedTypes.includes(ext)) {
  return res.status(415).json({ error: 'File type not allowed' });
}

if (!MIME_TYPES[ext] || file.mimetype !== MIME_TYPES[ext]) {
  return res.status(415).json({ error: 'MIME type mismatch' });
}

// 3. Prevent double extensions
if (file.originalname.split('.').length > 2) {
  return res.status(415).json({ error: 'Files with multiple extensions not allowed' });
}
```

---

## 🟠 MEDIUM SEVERITY ISSUES

### 6. **Hardcoded Secret in .env.example**
**Severity**: 🟠 MEDIUM  
**File**: [backend/.env.example:3](backend/.env.example#L3)  
**Status**: Unresolved ❌

**Code**:
```
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

**Risk**:
- Example encryption key should NOT be real/valid
- Developers may copy .env.example → .env and forget to regenerate
- Anyone with access to git history has a "valid" encryption key format
- If used in development, data encrypted with example key

**Impact**: 
- File encryption bypassed if this key is used
- Development data at risk

**Remediation**:
```bash
# .env.example
ENCRYPTION_KEY=<your-64-character-hex-string>  # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add warning to README.md:
# ⚠️ IMPORTANT: Generate a new ENCRYPTION_KEY for each environment
# DO NOT copy the example value into .env
```

---

### 7. **Account Lockout Returns Wrong HTTP Status (401 vs 423)**
**Severity**: 🟠 MEDIUM  
**File**: [backend/routes/auth.js:94-98](backend/routes/auth.js#L94-L98)  
**Status**: Implemented but untested ❌

**Code**:
```javascript
const locked = await isAccountLocked(userLookup.id);
if (locked) {
  logger.warn('Login blocked — account locked', { requestId: req.id, email });
  return res.status(423).json({ data: null, error: 'Account temporarily locked...' });
}
```

**Problem**:
- Implementation is correct (returns 423)
- But test mock doesn't properly set up `supabaseAdmin.auth.admin.listUsers()`
- Test returns 401 instead of 423 (test fails)
- Code is right, test is wrong

**Security Impact**: 
- Attackers can't distinguish between "account locked" vs "bad credentials"
- Both return 401 without proper status code
- Should return 423 for "locked" to prevent credential enumeration

**Remediation**:
See earlier QA Report for test fix.

---

### 8. **Unencrypted Sensitive Data in Application Logs**
**Severity**: 🟠 MEDIUM  
**Files**: 
- [backend/routes/collections.js:36-38](backend/routes/collections.js#L36-L38)
- [backend/routes/submissions.js:57-61](backend/routes/submissions.js#L57-L61)  
**Status**: Unresolved ❌

**Code**:
```javascript
// collections.js
console.log('📨 POST /collections received');
console.log('👤 User ID:', req.user?.id);
console.log('📝 Request body:', req.body);  // ← May contain sensitive data

// submissions.js
console.log('📤 POST /share/:shareCode/submit received');
console.log('   Student name:', student_name);
console.log('   Student email:', student_email);    // ← PII exposed
console.log('   Files count:', files.length);
```

**Risk**:
- Console logs appear in application logs, stderr, Docker containers
- Logs may be shipped to external logging services
- Student email addresses (PII) logged in plain text
- Custom fields may contain sensitive information

**Impact**: 
- GDPR/FERPA violation (student data disclosure)
- Information disclosure in logs
- If logs are public/accessible, student privacy breached

**Remediation**:
```javascript
// Remove all console.log() from production code
// Use structured logging with sanitization:

const sanitizeUser = (user) => ({ id: user.id }); // Remove email
const sanitizeEmail = (email) => email.slice(0, 3) + '***@***';

logger.info('Collection created', {
  userId: sanitizeUser(req.user).id,
  fieldsCount: req.body.fields?.length
  // Do NOT log: req.body, student_email, etc.
});
```

---

### 9. **Missing Secrets from Environment Variable Validation**
**Severity**: 🟠 MEDIUM  
**File**: [backend/server.js:25-36](backend/server.js#L25-L36)  
**Status**: Partial ⚠️

**Code**:
```javascript
const REQUIRED_ENV = [
  'PORT', 'JWT_SECRET', 'ENCRYPTION_KEY', 'SUPABASE_URL',
  'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET_NAME',
  'HDFS_WEBHDFS_URL', 'AI_SERVICE_URL'
];
```

**Missing Validations**:
1. ✅ ENV vars checked for presence
2. ❌ No validation of JWT_SECRET length (should be 32+ characters)
3. ❌ No validation of AWS credentials format
4. ❌ No validation of SUPABASE_URL format (must be HTTPS)
5. ❌ No check if encryption key is actually hex

**Current Check**:
```javascript
if (process.env.ENCRYPTION_KEY.length !== 64) {
  logger.error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  process.exit(1);
}
```

**Missing Checks**:
```javascript
// 1. JWT_SECRET length
if (process.env.JWT_SECRET.length < 32) {
  logger.error('JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

// 2. Supabase URL format
try {
  new URL(process.env.SUPABASE_URL);
  if (!process.env.SUPABASE_URL.startsWith('https://')) {
    throw new Error('Must use HTTPS');
  }
} catch {
  logger.error('SUPABASE_URL must be valid HTTPS URL');
  process.exit(1);
}

// 3. Encryption key is valid hex
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
  logger.error('ENCRYPTION_KEY must be valid 64-character hexadecimal');
  process.exit(1);
}
```

---

## 🟡 LOW SEVERITY ISSUES

### 10. **CSRF Protection Relies on SameSite Cookie Flag**
**Severity**: 🟡 LOW  
**File**: [backend/server.js:100-102](backend/server.js#L100-L102)  
**Status**: Documented ✅

**Code**:
```javascript
// NOTE: csurf removed — CSRF is mitigated by SameSite=Strict cookies + CORS origin check.
// All mutating routes require authenticateToken (JWT in HttpOnly cookie).
// Double-submit cookie pattern is unnecessary with this architecture.
```

**Assessment**:
- ✅ SameSite=Strict is strong protection
- ✅ CORS origin validation adds layer
- ✅ JWT in HttpOnly cookie (not accessible to JS)
- ⚠️ Assumes browser enforces SameSite (some older browsers don't)

**Recommendation**:
This is acceptable for modern browsers, but consider adding CSRF token for:
- Legacy browser support
- Defense in depth
- API client compatibility (mobile apps, postman)

---

### 11. **Verbose Error Messages in Production**
**Severity**: 🟡 LOW  
**File**: [backend/server.js:164-171](backend/server.js#L164-L171)  
**Status**: Partially handled ✅

**Code**:
```javascript
logger.error('Unhandled error', {
  requestId,
  error: err.message,
  stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
});

res.status(500).json({ error: 'Internal server error' });  // ✅ Good
```

**Status**: Already secure!
- ✅ Stack traces only in development
- ✅ Generic error message to client
- ✅ Error logged server-side with request ID

---

## ✅ STRONG SECURITY IMPLEMENTATIONS

### Authentication & Authorization ✅
- **JWT-based authentication** with proper token types (access vs refresh)
- **HttpOnly, Secure, SameSite=Strict cookies** prevent XSS/CSRF
- **Account lockout** after 5 failed attempts (15-minute duration)
- **Token expiration** (1 hour access, 7 day refresh)
- **Proper error handling** (doesn't reveal user existence)

### Encryption ✅
- **AES-256-CBC** for file encryption (strong algorithm)
- **Random IV** generated per file (prevents pattern analysis)
- **Proper key management** (64-character hex key from environment)
- **IV prepended to ciphertext** (allows streaming decryption)
- **SHA-256 integrity verification** on downloads

### Input Validation ✅
- **Joi schemas** for all input validation
- **Email format validation**
- **Password complexity enforcement** (uppercase, lowercase, digit, special char)
- **File size limits** enforced at multer level (50MB)
- **MIME type allowlist** for uploads

### Security Headers ✅
- **Helmet.js** configured with:
  - Content-Security-Policy (CSP)
  - HSTS (31536000s, includeSubDomains, preload)
  - X-Frame-Options: DENY (clickjacking protection)
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin

### Rate Limiting ✅
- **Auth endpoints**: 10 requests per 15 minutes (aggressive)
- **File operations**: 60 requests per minute
- **Uploads**: 100 requests per hour
- **Global**: 1000 requests per 15 minutes
- **Skips successful requests** for auth (only counts failures)

### API Security ✅
- **CORS properly configured** (origin whitelist, credentials: true)
- **Production HTTPS redirect** implemented
- **Graceful error handling** prevents information disclosure
- **Request ID tracking** for audit logs

---

## 📋 REMEDIATION PRIORITY

### 🔴 IMMEDIATE (Before Deployment)
1. **Update @aws-sdk/client-s3** to fix fast-xml-parser CVEs
2. **Update axios** to fix SSRF/metadata vulnerabilities
3. **Add rate limiting to /api/analytics**
4. **Add try-catch to JSON.parse() calls**
5. **Validate MIME types** in file uploads

### 🟠 SHORT-TERM (This Sprint)
6. Remove console.log statements with sensitive data
7. Add environment variable validation (JWT_SECRET length, SUPABASE_URL format)
8. Update .env.example to not include valid keys
9. Fix auth test mock for account lockout
10. Install frontend/backend npm security patches

### 🟡 MEDIUM-TERM (Next Sprint)
11. Consider CSRF token implementation (defense in depth)
12. Add structured logging library (Winston is good start)
13. Security headers audit on frontend
14. OWASP Top 10 penetration testing
15. Setup dependency vulnerability monitoring (Snyk, Dependabot)

---

## 🛠 Dependency Remediation Commands

```bash
# Backend
cd backend
npm audit fix --force  # May have breaking changes
npm install           # Reinstall with fixed versions
npm test             # Verify nothing broke

# Frontend
cd frontend
npm audit fix
npm test

# Check results
npm audit  # Should show 0 vulnerabilities
```

---

## 📊 Security Checklist

| Category | Status | Notes |
|----------|--------|-------|
| Authentication | ✅ Strong | JWT, SameSite cookies, account lockout |
| Authorization | ✅ Good | Token validation on protected routes |
| Encryption | ✅ Strong | AES-256-CBC with proper IV handling |
| Input Validation | ⚠️ Needs Work | Add MIME type validation |
| Output Encoding | ✅ Safe | No dangerouslySetInnerHTML in frontend |
| Injection Attacks | ✅ Protected | Using Supabase ORM (parameterized queries) |
| CSRF Protection | ✅ Good | SameSite cookies + CORS |
| XSS Protection | ✅ Good | CSP headers, no eval/innerHTML |
| File Upload | ⚠️ Needs Work | Add MIME type + double extension check |
| Rate Limiting | ⚠️ Needs Work | Missing on analytics endpoint |
| Secrets Management | ⚠️ Needs Work | Example key in repo, no validation |
| Dependencies | 🔴 CRITICAL | 2+ critical vulns in axios/fast-xml-parser |
| Logging | ⚠️ Needs Work | PII in console.log |
| Error Handling | ✅ Good | Generic messages to client |
| HTTPS | ✅ Good | Redirect in production mode |

---

## 🔍 Testing Recommendations

### Security Testing
```bash
# 1. Dependency vulnerability scan
npm audit
pip install pip-audit && pip-audit

# 2. Static analysis
npm install -g snyk
snyk test

# 3. OWASP Top 10 manual testing
# - SQL Injection: Try `email' OR '1'='1`
# - XSS: Try `<img src=x onerror=alert(1)>` in forms
# - CSRF: Test token requirement
# - XXE: Try XML bomb in uploads
# - Rate limit bypass: Rapid requests

# 4. Cryptography validation
node -e "
const crypto = require('crypto');
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
console.log('Key length:', key.length, 'bytes (expected 32)');
console.log('Algorithm: AES-256-CBC');
"
```

---

## 📞 Recommendations Summary

**Before Production**:
1. ✋ **STOP**: Fix critical dependency vulnerabilities
2. ✋ **STOP**: Add analytics rate limiting
3. ✋ **STOP**: Fix JSON parsing error handling
4. 👀 Review and test account lockout thoroughly
5. 👀 Add MIME type validation to file uploads
6. 👀 Remove sensitive data from console logs

**After Production Launch**:
1. 📊 Setup continuous dependency scanning (Dependabot)
2. 📊 Enable structured logging to centralized service
3. 📊 Monitor for suspicious auth patterns
4. 📊 Regular OWASP Top 10 security audits
5. 📊 Implement WAF (Web Application Firewall)

---

## 🎓 Security Resources

- [OWASP Top 10 2025](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/nodejs-security/)
- [AWS S3 Security](https://docs.aws.amazon.com/s3/latest/userguide/security.html)
- [Encryption Standards](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

---

**Report Generated**: April 23, 2026  
**Auditor**: Security Analysis System  
**Next Review**: After critical issues resolved
