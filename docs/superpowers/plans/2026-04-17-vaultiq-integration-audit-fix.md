# VaultIQ — Full Integration Audit, Bug-Fix & Test Pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every broken integration seam, make all 6 AnalyticsDashboard tests pass, and ensure the full register→login→upload→detect→collect→analytics flow works end-to-end.

**Architecture:** Cookie-based JWT auth (HttpOnly), AES-256 encrypted S3 storage, FastAPI AI service on port 8001, 3-tier analytics (HDFS→local file→Supabase live), collections/submissions for assignment intake.

**Tech Stack:** Node.js/Express 5, React 19, Supabase (Postgres + Auth), AWS S3 SDK v3, FastAPI/Python, Recharts, Tailwind CSS, Jest + React Testing Library

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## FULL AUDIT REPORT (Phase 0 findings)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
┌─ BACKEND
│  ✅ Working:
│     - server.js startup, env validation, rate limiting, CORS, helmet
│     - JWT auth middleware (cookies + Bearer fallback)
│     - POST /api/auth/register, /login, /logout, /refresh, /me
│     - POST /api/files/upload (AES-256-CBC, IV-prepend, S3, SHA-256 integrity)
│     - GET  /api/files/:id/download (stream+buffer decrypt, integrity check)
│     - DELETE /api/files/:id and /api/files/bulk
│     - GET  /api/analytics (3-tier: HDFS→local→Supabase)
│     - POST /api/analytics/trigger (spawns run_analytics.sh)
│     - POST /api/ai-detect (direct upload) and /from-vault (vault decrypt)
│     - POST /api/collections (create with share code)
│     - GET  /api/collections, /:id, /:id/submissions
│     - POST /api/share/:shareCode/submit (public, no auth)
│     - GET  /api/share/:shareCode (public)
│     - logEvent fire-and-forget pattern correct in files.js
│
│  ❌ Broken:
│     - auth.js:L87   — queries from('profiles') table which does NOT exist
│                       in any migration; lockout pre-check always silently
│                       fails → no account lockout protection at all
│     - run_analytics.sh:L19 — fallback uses relative path
│                       "python3 bigdata/mapreduce_fallback.py" instead of
│                       "python3 $SCRIPT_DIR/mapreduce_fallback.py";
│                       fails whenever spawned from backend (different CWD)
│
│  ⚠️  Missing / sub-optimal:
│     - console.log/error in collectionHelpers.js, detectionHelper.js,
│       accountLockout.js (should use logger util)
│     - backend/.env.example missing HDFS_ENABLED, HDFS_USER, AWS_BUCKET_NAME,
│       ALLOWED_ORIGINS, SMTP_*, FRONTEND_URL, FASTAPI_URL fields

├─ FRONTEND
│  ✅ Working:
│     - index.js: BrowserRouter + AuthProvider wiring correct
│     - AuthContext: HttpOnly cookie session restore via /api/auth/me
│     - services/api.js: axios instance, withCredentials:true, silent 401
│       refresh queue, redirect to /login on refresh failure
│     - authService.js: register/login/logout/getMe all use api correctly
│     - fileService.js: upload, download (blob), delete, stats all correct
│     - analyticsApi.js: uses api instance (cookies sent) ✓
│     - aiDetectApi.js: detectFiles, detectVaultFiles, fetchAIHistory all
│       use api instance ✓
│     - App.jsx: routes correct, ProtectedRoute handles loading spinner ✓
│     - Analytics.jsx (page): uses normalized API shape correctly ✓
│     - AnalyticsDashboard.jsx: all charts render with test fixture shape ✓
│       (component is not in routes — only tested directly)
│
│  ❌ Broken:
│     - fileService.js:L9    — explicit `Content-Type: multipart/form-data`
│                               header strips the multipart boundary that
│                               axios/browser sets automatically; multer
│                               may fail to parse uploads. Must be removed.
│     - CollectionsPage.jsx:L19   — uses fetch() with
│                               Authorization: Bearer ${localStorage.getItem('token')}
│                               Auth is HttpOnly cookie based; localStorage
│                               token is ALWAYS null → every request is 401
│     - CollectionsPage.jsx:L23   — data path wrong: API returns
│                               { data: { collections:[...] } } but code
│                               reads data.collections (undefined)
│     - collectionsApi.js:L7      — same localStorage token bug
│     - CollectionDetailsPage.jsx:L23,29,42,50,62 — same localStorage bug
│     - CollectionDetailsPage.jsx:L26 — stores full response body
│                               { data:{...} } as collection state; then
│                               reads collection.name (undefined)
│     - CollectionDetailsPage.jsx:L104 — reads collection.unique_share_code
│                               but API returns { shareCode } (camelCase,
│                               no 'unique_' prefix)
│     - AnalyticsDashboard.jsx — test_1 checks for text 'VaultIQ Analytics'
│                               (missing from component) and 'Events Today'
│                               (missing; component has 'Total Vault Files')
│
│  ⚠️  Missing:
│     - AnalyticsDashboard.jsx reads data.source but live API returns _source;
│       cosmetic bug (badge shows '—') but tests pass because mock fixture
│       uses `source` key directly

├─ AI SERVICE
│  ✅ Working:
│     - FastAPI app, CORS, /health, /detect (file upload), /detect/text,
│       /analysis/add stub
│     - detector.py, extractor.py, preprocessor.py pipeline correct
│     - ai-service/.env: PORT=8001 matches backend AI_SERVICE_URL=:8001 ✓
│     - models/lr_model.pkl + tfidf.pkl present, dummy fallback if absent ✓
│
│  ⚠️  Minor:
│     - startup_event uses @app.on_event("startup") which is deprecated
│       in FastAPI 0.111+; should use lifespan context manager (not broken)

├─ INTEGRATION GAPS
│  1. fileService.js → backend POST /api/files/upload
│     BROKEN: explicit Content-Type header may strip multipart boundary
│  2. CollectionsPage/collectionsApi.js → backend GET/POST /api/collections
│     BROKEN: localStorage token always null → 401
│  3. CollectionDetailsPage.jsx → backend GET /api/collections/:id
│     BROKEN: wrong auth + wrong data access path + wrong field name
│  4. run_analytics.sh (triggered by POST /api/analytics/trigger)
│     BROKEN: relative path for fallback fails when backend spawns it
│  5. auth.js login lockout → login_attempts table
│     BROKEN: lockout check queries non-existent 'profiles' table

├─ SECURITY ISSUES
│  ✅ SUPABASE_SERVICE_KEY not in frontend bundle (confirmed)
│  ✅ IDOR protection on file routes (user_id filter at query level)
│  ✅ HttpOnly cookies — token never in JS
│  ⚠️  auth.js lockout pre-check broken (see above) — lockout bypassed

└─ IMPROVEMENT AREAS
   CRITICAL: Fix all ❌ items above (8 issues, 6 files)
   HIGH:     run_analytics.sh path, auth lockout table query
   MEDIUM:   AnalyticsDashboard.jsx data.source cosmetic fix,
             console.log cleanup, .env.example update
   LOW:      Dashboard chart shows hardcoded zeros (no live data wired)
             No pagination UI control on files list (API supports it)
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## IMPLEMENTATION TASKS (Phase 1-5)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

### Task 1: Fix file upload — remove explicit Content-Type header

**Files:**
- Modify: `frontend/src/services/fileService.js:L9`

**What's broken:** `headers: { 'Content-Type': 'multipart/form-data' }` strips
the multipart boundary that axios sets automatically when it detects FormData.
Multer on the backend expects `multipart/form-data; boundary=----...`.

- [ ] **Step 1: Edit fileService.js — remove the explicit Content-Type header**

```js
// frontend/src/services/fileService.js — uploadFile method
uploadFile: async (file, onUploadProgress) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/api/files/upload', formData, {
    // No Content-Type — axios detects FormData and sets boundary automatically
    onUploadProgress
  });
  
  return response.data.data.file;
},
```

- [ ] **Step 2: Verify the change is minimal (no other lines touched)**

Run: `diff` mentally — only `headers: { 'Content-Type': 'multipart/form-data' },` line removed.

---

### Task 2: Fix CollectionsPage — replace fetch with api, fix data path

**Files:**
- Modify: `frontend/src/pages/CollectionsPage.jsx:L1,L18-28`

**What's broken:**
1. `fetch('/api/collections', { headers: { Authorization: Bearer ${localStorage.getItem('token')} } })` — localStorage token is null (auth uses HttpOnly cookies); all requests are 401.
2. `data.collections` is `undefined` — API response shape is `{ data: { collections: [...] } }`.

- [ ] **Step 1: Edit CollectionsPage.jsx — replace fetch with api axios instance**

Add import at top:
```jsx
import api from '../services/api';
```

Replace the `fetchCollections` function (lines 17-29):
```jsx
const fetchCollections = async () => {
  try {
    const response = await api.get('/api/collections');
    setCollections(response.data?.data?.collections || []);
  } catch (err) {
    setError('Failed to load collections');
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 2: Verify no other fetch() calls remain in the file**

Grep: `grep -n "fetch(" frontend/src/pages/CollectionsPage.jsx`
Expected: no results.

---

### Task 3: Fix collectionsApi.js — replace fetch with api axios instance

**Files:**
- Modify: `frontend/src/api/collectionsApi.js`

**What's broken:** Both functions use `fetch` with `Authorization: Bearer ${localStorage.getItem('token')}` — always null.

- [ ] **Step 1: Rewrite collectionsApi.js to use api axios instance**

```js
// frontend/src/api/collectionsApi.js
import api from '../services/api';

export async function createCollection(data) {
  const response = await api.post('/api/collections', data);
  return response.data?.data || response.data;
}

export async function fetchCollectionDetails(id) {
  const response = await api.get(`/api/collections/${id}`);
  return response.data?.data || response.data;
}
```

- [ ] **Step 2: Verify no localStorage or fetch() references remain**

Grep: `grep -n "localStorage\|fetch(" frontend/src/api/collectionsApi.js`
Expected: no results.

---

### Task 4: Fix CollectionDetailsPage — auth, data paths, field names

**Files:**
- Modify: `frontend/src/pages/CollectionDetailsPage.jsx`

**What's broken:**
1. All fetch() calls use localStorage token (null) → 401.
2. `setCollection(collectionData)` stores `{ data: {...} }` not the inner object → `collection.name` is undefined.
3. `collection.unique_share_code` — API returns `shareCode` (camelCase, no prefix).

- [ ] **Step 1: Edit CollectionDetailsPage.jsx — add api import**

```jsx
import api from '../services/api';
```

- [ ] **Step 2: Replace fetchData function**

```jsx
const fetchData = async () => {
  try {
    const colRes = await api.get(`/api/collections/${id}`);
    setCollection(colRes.data?.data || colRes.data);

    const subRes = await api.get(`/api/collections/${id}/submissions`);
    setSubmissions(subRes.data?.submissions || []);
  } catch (err) {
    setError('Failed to load data');
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Replace handleRunDetection and handleRunAllDetection**

```jsx
const handleRunDetection = async (submissionId) => {
  try {
    await api.post(`/api/collections/${id}/detect`, {
      submissionIds: [submissionId],
    });
    await fetchData();
  } catch (err) {
    setError('Failed to trigger detection');
  }
};

const handleRunAllDetection = async () => {
  try {
    await api.post(`/api/collections/${id}/detect`, {});
    await fetchData();
  } catch (err) {
    setError('Failed to trigger bulk detection');
  }
};
```

- [ ] **Step 4: Fix the share link input — use `collection.shareCode` not `collection.unique_share_code`**

Line ~104: change
```jsx
value={`${window.location.origin}/submit/${collection.unique_share_code}`}
```
to
```jsx
value={`${window.location.origin}/submit/${collection?.shareCode || collection?.data?.shareCode || ''}`}
```

- [ ] **Step 5: Verify — no remaining fetch() or localStorage references**

Grep: `grep -n "localStorage\|fetch(" frontend/src/pages/CollectionDetailsPage.jsx`
Expected: no results.

---

### Task 5: Fix AnalyticsDashboard — add missing text labels for tests

**Files:**
- Modify: `frontend/src/components/AnalyticsDashboard.jsx`

**What's broken:** test_1 in `AnalyticsDashboard.test.jsx` asserts:
- `screen.getByText('VaultIQ Analytics')` — text absent from component
- `screen.getByText('Events Today')` — absent; component has 'Total Vault Files'

- [ ] **Step 1: Add 'VaultIQ Analytics' heading in the header section**

In the header `<div className={styles.header}>` block, add the title above the
`titleRow` div (around line 270):

```jsx
<div className={styles.header}>
  <div>
    <p className={styles.pageTitle}>VaultIQ Analytics</p>  {/* ← add this */}
    <div className={styles.titleRow}>
      {data && <SourceBadge source={data._source || data.source} />}
      <p className={styles.subtitle} style={{ margin: 0 }}>
        Last updated:&nbsp;{data ? fmtDate(data.generated_at) : '—'}
      </p>
    </div>
  </div>
  ...
```

Also fix `data.source` → `data._source || data.source` so the live API's `_source`
field is also handled.

- [ ] **Step 2: Rename 'Total Vault Files' metric card → 'Events Today' with correct value**

Compute `todayEvents` from today's uploads + downloads + detections:

```jsx
// After existing today* calculations (around line 160):
const todayDownloads = todayIdx >= 0 ? (downloads[todayIdx] || 0) : (downloads.at(-1) || 0);
const todayUploadsCount = todayIdx >= 0 ? (uploads[todayIdx] || 0) : (uploads.at(-1) || 0);
const todayEvents = todayUploadsCount + todayDownloads + todayDetects;
```

Replace the first MetricCard:
```jsx
// BEFORE:
<MetricCard label="Total Vault Files" value={(data._summary?.total_files ?? 0).toLocaleString()} accent="#0a84ff" />
// AFTER:
<MetricCard label="Events Today" value={todayEvents.toLocaleString()} accent="#0a84ff" />
```

- [ ] **Step 3: Add `pageTitle` CSS class to AnalyticsDashboard.module.css**

```css
/* In AnalyticsDashboard.module.css — add at end */
.pageTitle {
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.4px;
  margin: 0 0 4px;
  font-family: var(--font-sans);
}
```

- [ ] **Step 4: Run the tests — all 6 must pass**

Run: `cd frontend && npm test -- --testPathPattern=AnalyticsDashboard --watchAll=false`

Expected output:
```
PASS src/tests/AnalyticsDashboard.test.jsx
  ✓ renders metric cards with correct values from fixture
  ✓ renders "No anomalies detected" when delete_spikes is []
  ✓ shows loading skeleton before data resolves
  ✓ shows error message when fetchAnalytics rejects
  ✓ all 6 analytics section headings are rendered when data loads
  ✓ renders "Local Cache" source badge
Test Suites: 1 passed, 1 total
```

---

### Task 6: Fix run_analytics.sh — correct relative path in fallback

**Files:**
- Modify: `bigdata/run_analytics.sh:L19`

**What's broken:** Line 19 uses a relative path `python3 bigdata/mapreduce_fallback.py`
which fails when the script is spawned by the backend (which runs from `backend/`).
`$SCRIPT_DIR` is already set correctly to the bigdata directory on line 5.

- [ ] **Step 1: Fix the relative path**

```bash
# BEFORE (line 19):
  python3 bigdata/mapreduce_fallback.py
# AFTER:
  python3 "$SCRIPT_DIR/mapreduce_fallback.py"
```

The `else` block (lines 17-20) becomes:
```bash
else
  echo "[VaultIQ Analytics] Spark not found — running Python fallback"
  python3 "$SCRIPT_DIR/mapreduce_fallback.py"
fi
```

- [ ] **Step 2: Verify the spark-succeeded fallback path (line 12) is already correct**

Line 12: `python3 "$SCRIPT_DIR/mapreduce_fallback.py"` — already uses `$SCRIPT_DIR` ✓

---

### Task 7: Fix auth.js — replace non-existent 'profiles' table query

**Files:**
- Modify: `backend/routes/auth.js:L86-99`

**What's broken:** The login route pre-checks account lockout by querying
`from('profiles')` which does not exist in any migration. The query silently
returns null, so `userLookup` is always null and lockout tracking never fires.

The fix: query `from('users')` (the public users table per the schema) or, if
that table also doesn't guarantee email lookup, skip the pre-lookup entirely and
only record failed logins after the auth attempt (we have the user ID from
Supabase's auth error response is not available, but we can still do the lockout
record using the email-based lookup against the files table or auth.users via admin.getUserByEmail).

The safest fix with zero schema changes: use `supabaseAdmin.auth.admin.getUserByEmail(email)` which works server-side:

- [ ] **Step 1: Replace the profiles lookup with auth.admin.getUserByEmail**

Replace lines 86-99 in `backend/routes/auth.js`:
```js
// BEFORE:
const { data: userLookup } = await supabaseAdmin
  .from('profiles')
  .select('id')
  .eq('email', email)
  .single();

if (userLookup?.id) {
  const locked = await isAccountLocked(userLookup.id);
  if (locked) { ... }
}

// AFTER:
let userId = null;
try {
  const { data: adminUser } = await supabaseAdmin.auth.admin.listUsers();
  // listUsers returns all users — use getUserByEmail via filter
  const { data: userByEmail } = await supabaseAdmin.auth.admin.getUserByEmail ? 
    await supabaseAdmin.auth.admin.getUserByEmail(email).catch(() => ({ data: null })) :
    { data: null };
  userId = userByEmail?.user?.id || null;
} catch (_) { /* fail open — don't block login */ }

if (userId) {
  const locked = await isAccountLocked(userId);
  if (locked) {
    logger.warn('Login blocked — account locked', { requestId: req.id, email });
    return res.status(423).json({ data: null, error: 'Account temporarily locked due to too many failed attempts. Try again later.' });
  }
}
```

Wait — `supabaseAdmin.auth.admin.getUserByEmail` is not a standard Supabase Admin API method. The correct approach is:

```js
// Use listUsers with pagination and filter — OR — 
// Just skip the pre-check since the lockout IS recorded after a failed login
// using authData.user.id if signInWithPassword fails with the user existing.
```

Actually the cleanest fix: if `signInWithPassword` fails, Supabase doesn't return the user.id. So the existing pattern (pre-lookup) was needed. But 'profiles' table doesn't exist. The right fix: query `auth.users` via admin:

```js
// Replace the profiles lookup:
let userId = null;
try {
  // Use admin client to look up user by email in auth.users
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ 
    filter: `email=${email}` 
  });
  userId = users?.[0]?.id || null;
} catch (_) { /* fail open */ }
```

Note: `listUsers` with `filter` is available in Supabase admin SDK v2. Use this.

- [ ] **Step 2: Apply the fix — replace the profiles query block**

```js
// backend/routes/auth.js — replace lines 86-98 (the profiles lookup block):
let userId = null;
try {
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({
    filter: `email=${email}`,
  });
  userId = users?.[0]?.id || null;
} catch (_) {
  // Fail open — if lookup fails, skip lockout check (don't block legitimate logins)
}

if (userId) {
  const locked = await isAccountLocked(userId);
  if (locked) {
    logger.warn('Login blocked — account locked', { requestId: req.id, email });
    return res.status(423).json({ data: null, error: 'Account temporarily locked due to too many failed attempts. Try again later.' });
  }
}
```

Also update the `recordFailedLogin` call below (line ~108) to use `userId` instead of `userLookup?.id`, and the `logEvent` call to use `userId`:

```js
if (userId) {
  await recordFailedLogin(userId, email);
}
logEvent('login_failed', {
  userId: userId ?? null,
  ipAddress: req.ip,
  durationMs: Date.now() - start,
}).catch(() => {});
```

---

### Task 8: Update .env.example files

**Files:**
- Modify: `backend/.env.example`
- Modify: `.env.example` (root)

**What's missing:** Several env vars present in `backend/.env` are missing from
`backend/.env.example`, which is the developer reference.

- [ ] **Step 1: Update backend/.env.example with all vars and comments**

```bash
# ── Server ──────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development

# ── JWT ─────────────────────────────────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_64_char_hex_secret

# ── AES-256 Encryption (must be exactly 64 hex chars = 32 bytes) ────
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# ── Supabase ─────────────────────────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key          # sb_publishable_...
SUPABASE_SERVICE_KEY=your_service_key    # sb_secret_...  (server only, never frontend)

# ── AWS S3 ───────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=eu-north-1
S3_BUCKET_NAME=your-bucket-name
AWS_BUCKET_NAME=your-bucket-name        # used by collectionHelpers.js

# ── Hadoop HDFS (set HDFS_ENABLED=false for local dev) ───────────────
HDFS_ENABLED=false                       # true only inside Docker with namenode
HDFS_WEBHDFS_URL=http://namenode:9870/webhdfs/v1
HDFS_USER=root

# ── AI Service ───────────────────────────────────────────────────────
AI_SERVICE_URL=http://127.0.0.1:8001    # FastAPI server port (must match ai-service/.env PORT)
FASTAPI_URL=http://127.0.0.1:8001       # alias used by collectionHelpers.js

# ── CORS ─────────────────────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# ── Email (nodemailer — needed for account lockout alerts) ────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password            # Gmail: use App Password, not account password
SMTP_FROM=noreply@vaultiq.com
FRONTEND_URL=http://localhost:3000
```

---

### Task 9: Phase 5 — Start servers and run full test suite

**What to verify:**

- [ ] **Step 1: Start backend**
```bash
cd backend && npm run dev
```
Expected: `VaultIQ backend listening on port 5000` — no errors.

- [ ] **Step 2: Start AI service**
```bash
cd ai-service && source ../.venv/bin/activate && uvicorn main:app --reload --port 8001
```
Expected: `Uvicorn running on http://0.0.0.0:8001` — models loaded message.

- [ ] **Step 3: Build frontend (check for errors)**
```bash
cd frontend && npm run build
```
Expected: `Compiled successfully` — no errors, bundle size printed.

- [ ] **Step 4: Start frontend dev server**
```bash
cd frontend && npm start
```
Expected: `Compiled successfully` on port 3000.

- [ ] **Step 5: Run AnalyticsDashboard tests**
```bash
cd frontend && npm test -- --testPathPattern=AnalyticsDashboard --watchAll=false
```
Expected: 6/6 tests PASS.

- [ ] **Step 6: Scan for service_role key in frontend bundle**
```bash
grep -r "service_role" frontend/src/
```
Expected: no output.

- [ ] **Step 7: Scan for remaining TODO/FIXME/console.log in backend routes**
```bash
grep -rn "TODO\|FIXME\|HACK\|console\.log" backend/routes/ backend/utils/ 2>/dev/null | grep -v node_modules
```
Expected: any console.log in utils are at acceptable level (error logging, not debug).

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## IMPROVEMENTS REPORT (Phase 4)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### CRITICAL (fix immediately — blocks core functionality)
None after the tasks above are applied.

### HIGH (degrades UX or security significantly)
1. **`CollectionDetailsPage` polling every 4s has no cleanup guard** — `fetchData` in `setInterval` can cause state updates on unmounted component (React 19 warning). The `clearInterval` in cleanup is correct, but `fetchData` should check a `isMounted` ref.
2. **No file type validation on student submission uploads** (`POST /api/share/:code/submit`) — any file type accepted. Should validate MIME type and extension as files.js does.
3. **AI detection results not stored in Supabase `ai_detection_results` for direct file uploads** (`POST /api/ai-detect`) — results are only stored in the local JSON file (`ai_detections.json`). The `ai_detection_results` table is only populated via the collections submission flow. Direct vault scans never write to the DB table.
4. **`Dashboard.jsx` activity chart shows hardcoded zeros** — chart data is a static `CHART_DATA` array. Should pull from `/api/analytics` for live data.

### MEDIUM (should be done before demo)
5. **Plagiarism scan is synchronous on upload** — `POST /api/ai-detect` blocks until the AI service responds. For large files this can take 30-60s. Should return immediately with a job ID and let frontend poll.
6. **No pagination UI on files list** — backend supports `?page=N` but `FilesPage.jsx` has no "Load more" button wired up.
7. **AnalyticsDashboard.jsx not in any route** — the component exists and is tested but unreachable in the UI. Either add a route or remove it; currently dead code.
8. **submissions.js imports axios but never uses it** — unused import.
9. **collections.js creates a 2nd Supabase client** inline instead of using the shared `supabaseAdmin` from `utils/supabase.js`.

### LOW (nice to have)
10. No drag-and-drop upload zone on FilesPage (UploadZone component exists but uses react-dropzone — wire it properly).
11. No email notification when plagiarism scan completes (emailService exists, just not called from AI detection results).
12. No dark mode toggle (CSS variables are set up, just no toggle UI).
13. No file preview for PDFs.

### PERFORMANCE
14. **N+1 in CollectionDetailsPage** — polls every 4s fetching BOTH collection details AND all submissions + their detection results. At scale this is expensive. Should use a single joined query or WebSocket.
15. **analytics.js Supabase fallback fetches ALL files** (`select('id, filename, file_size, ...')`) without any limit. With 100k+ files this will timeout. Add `.limit(10000)` or use aggregation.
16. **`aiDetection.js` appendAIResult** reads and rewrites the entire JSON file on every detection call — will degrade with scale. Should use the Supabase `ai_detection_results` table instead.

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## DELIVERABLE CHECKLIST
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After all tasks complete, confirm:

- [ ] Backend starts without errors (`npm run dev`)
- [ ] Frontend builds without errors (`npm run build`)
- [ ] Register → Login → Dashboard flow works in browser
- [ ] Upload file → appears in list → plagiarism result shown
- [ ] Download file → decrypted and readable
- [ ] Delete file → removed from list and DB
- [ ] Create collection → get share code → student submits
- [ ] /analytics loads with charts rendering (not blank)
- [ ] All 6 AnalyticsDashboard tests pass
- [ ] No service_role key in frontend source
- [ ] Cross-user file access blocked (403/404)
- [ ] Improvements report produced ✓ (above)
- [ ] .env.example updated with all required variables ✓
