# Assignment Collection with Auto-Detection — Phase 2 Design Spec

**Date:** April 15, 2026  
**Phase:** 2 (Post-Phase 1 evaluation feedback)  
**Status:** In Design

---

## Overview

Extend VaultIQ to enable teachers to **generate shareable links for collecting student assignments** with **optional automatic AI detection**. Teachers can:
- Create collection links with a single click
- Toggle automatic AI detection ON/OFF
- View all submissions in a hybrid dashboard (summary stats + filterable list)
- Manually trigger detection on individual submissions or bulk
- Download results as CSV

Students can:
- Access the link without logging in
- Submit assignments with metadata (name, ID, notes)
- Receive submission confirmation (no AI results shown to them)

All data (files, metadata, results) stored in AWS (S3 + PostgreSQL).

---

## User Workflows

### Teacher Workflow

1. **Create Collection Link**
   - Navigate to "New Collection" (new page)
   - Fill form: collection name, description, optional deadline
   - Toggle "Auto-detect AI" ON or OFF
   - Click "Generate Link"
   - Get unique shareable link + QR code to share with students

2. **Monitor Submissions**
   - Open collection dashboard (polling every 4 seconds for updates)
   - See summary: total submissions, AI detection rate %, avg score, model used
   - View submission list: filterable by name, sortable by score/date/status
   - Status indicators: "Pending Detection" → "Processing" → "Completed"

3. **Trigger Detection (if auto-detect OFF)**
   - Click "Run Detection" button on individual submission row
   - OR click "Detect All" button for bulk operation
   - Watch status update in real-time as detection completes

4. **Analyze & Export**
   - Click submission row to see detailed AI results (like current AIDetector)
   - See verdict badge, confidence, segment analysis, similarity score
   - Download all results as CSV export

### Student Workflow

1. **Access Submission Link**
   - Click/scan shared link (e.g., `vaultiq.com/submit/abc123xyz`)
   - Land on public submission page (no login required)

2. **Fill Submission Form**
   - Enter name (required)
   - Enter student ID (optional)
   - Add notes/comments (optional)
   - Upload files (PDF, DOCX, TXT — max 5 files)

3. **Submit**
   - Click "Submit Assignment"
   - See confirmation message: "Submitted successfully. Teacher will review."
   - Do NOT see AI detection results

---

## Data Model

### Database Schema (Supabase PostgreSQL)

#### `collections` Table
```sql
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  auto_detect_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  unique_share_code TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_collections_user ON collections(user_id);
CREATE INDEX idx_collections_share_code ON collections(unique_share_code);
```

#### `submissions` Table
```sql
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id TEXT,
  student_notes TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  s3_folder_path TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_submissions_collection ON submissions(collection_id);
CREATE INDEX idx_submissions_submitted_at ON submissions(submitted_at);
```

#### `ai_detection_results` Table
```sql
CREATE TABLE ai_detection_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  s3_file_path TEXT NOT NULL,
  ai_score FLOAT CHECK (ai_score >= 0 AND ai_score <= 1),
  verdict TEXT CHECK (verdict IN ('human', 'mixed', 'ai')),
  confidence TEXT CHECK (confidence IN ('high', 'low')),
  chunk_scores JSONB,
  similarity_score FLOAT,
  detected_at TIMESTAMP,
  detection_status TEXT DEFAULT 'pending' CHECK (detection_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_results_submission ON ai_detection_results(submission_id);
CREATE INDEX idx_results_status ON ai_detection_results(detection_status);
```

### AWS S3 Structure
```
vaultiq-bucket/
├── collections/
│   └── {collection_id}/
│       ├── {submission_id}/
│       │   ├── file1.pdf
│       │   ├── file2.docx
│       │   ├── metadata.json  (student name, ID, notes, submitted_at)
│       │   └── ...
```

---

## Frontend Architecture

### New Pages

#### 1. **CollectionsPage** (Overview)
- List all collections created by logged-in teacher
- Buttons: "New Collection", "Archive", "View Details"
- Shows status, submission count, creation date per collection

#### 2. **CreateCollectionPage** (Link Creation Form)
- Form fields:
  - Collection Name (required)
  - Description (optional)
  - Deadline (optional date picker)
  - Auto-detect toggle (ON/OFF)
- On submit: POST to `/api/collections` → get collection ID + share code
- Show success screen with shareable link + QR code + copy button

#### 3. **CollectionDetailsPage** (Results Dashboard)
- **Summary Panel** (top):
  - Total submissions count
  - AI detection rate (% with verdict='ai')
  - Average AI score
  - Model used (hardcoded: "AI Detection Model v1.0")
  - Status: "Active" / "Closed" / "Archived"
  
- **Submission List** (main):
  - Table columns: Student Name | Files | AI Score | Status | Verdict | Actions
  - Filters: by name, by verdict, by status
  - Sorting: by score, by date, by name
  - Search bar for student name
  
  - Status indicators:
    - "Pending Detection" (gray) — if auto-detect OFF and not triggered yet
    - "Processing" (blue spinner) — detection in progress
    - "Completed" (green) — done, score visible
    - "Failed" (red) — detection error, show error message
  
  - Actions per row:
    - Click row → expand to show file list + detailed results
    - "Run Detection" button (if status is pending/failed)
    - "Delete Submission" button (if needed)
  
  - Bulk actions:
    - "Run All Detections" button (if any pending)
    - "Download as CSV" button (exports all results)

#### 4. **StudentSubmissionPage** (Public Form)
- Accessed via `/submit/{shareCode}`
- Unprotected route (no login required)
- Form fields:
  - Student Name (required)
  - Student ID (optional)
  - Notes/Comments (optional textarea)
  - File Upload (dropzone, max 5 files)
- On submit: POST to `/api/share/{shareCode}/submit`
  - Files → S3
  - Metadata → submissions table
  - If auto-detect ON → trigger detection immediately
  - Show success: "Submission received. Teacher will review."

---

## Backend Architecture

### New API Endpoints

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/collections` | Create new collection | Required (Teacher) |
| GET | `/api/collections` | List user's collections | Required (Teacher) |
| GET | `/api/collections/:id` | Get collection details | Required (Teacher) |
| GET | `/api/collections/:id/submissions` | List submissions + results (pollable) | Required (Teacher) |
| POST | `/api/collections/:id/detect` | Trigger manual detection | Required (Teacher) |
| GET | `/api/share/:shareCode` | Check if collection exists | None |
| POST | `/api/share/:shareCode/submit` | Student submits assignment | None |
| GET | `/api/collections/:id/results/export` | Export results as CSV | Required (Teacher) |

### Detection Flow

#### **If auto-detect is ON:**
1. Student submits via `/api/share/{shareCode}/submit`
2. Backend:
   - Validates collection exists and is active
   - Uploads files to S3: `collections/{collection_id}/{submission_id}/{filename}`
   - Creates submission record (status='active')
   - Creates ai_detection_results rows with status='pending'
3. **Immediately** call FastAPI `/detect` endpoint for each file
4. FastAPI returns: ai_score, verdict, confidence, chunk_scores, etc.
5. Backend updates ai_detection_results:
   - Set status='completed'
   - Store ai_score, verdict, confidence, chunk_scores
   - Store detected_at timestamp
6. Teacher polls `/api/collections/:id/submissions` → sees results appear in real-time

#### **If auto-detect is OFF:**
1. Student submits → files go to S3, submission created, detection_status='pending'
2. Teacher opens collection dashboard → sees submissions with status='pending'
3. Teacher clicks "Run Detection" (per row or bulk)
4. Backend calls FastAPI for each file (same as above)
5. Results appear as teacher watches (polling updates UI)

### Key Implementation Details

**Polling Endpoint:** `/api/collections/:id/submissions`
- Returns: All submissions for collection + their latest AI detection results
- Include: `updated_at` timestamp to support client-side incremental updates
- Query params: `?limit=50&offset=0` for pagination

**Error Handling:**
- If FastAPI detection fails: Set status='failed', store error_message
- Show user: "Detection failed. Click 'Retry' to run again."
- Retry should trigger detection again

**Timestamps:**
- `submissions.submitted_at` — when student clicked submit
- `ai_detection_results.detected_at` — when detection completed
- Use these for sorting/filtering

---

## Real-Time Updates Strategy

**Approach: Polling (HTTP Long-Polling Alternative)**

- Teacher's dashboard polls `/api/collections/:id/submissions` every **4 seconds**
- Server returns only submissions + results that changed since last request
- Client detects new/updated records and smoothly updates UI

**Optimization:**
- Client tracks `last_seen_updated_at` timestamp
- Server filters: `WHERE updated_at > last_seen_updated_at`
- Only returns changed rows, reducing payload

**UI Feedback:**
- Show submission status with spinner while processing
- Fade in results when completed
- Show timestamp when detection finished

---

## Security & Permissions

- **Collection creation:** Only authenticated users (teachers)
- **Submission access:** Public via share code (any user can submit)
- **Results access:** Only collection creator (teacher) can view
- **Share code:** Should be unguessable (UUID or long random string)
- **S3 files:** Encrypted (existing VaultIQ encryption), access restricted to authenticated backend

---

## Testing Strategy

- Unit tests for new API endpoints
- Integration tests for submission → detection flow
- E2E test: Create link → submit student file → detect AI → verify results
- Load test: Simulate 100+ concurrent submissions to ensure polling scales

---

## Success Criteria

✅ Teacher can create shareable link in < 30 seconds  
✅ Student can submit assignment without login  
✅ Auto-detection (if enabled) completes within 60 seconds of submission  
✅ Teacher sees results in dashboard within 4 seconds of completion  
✅ All files stored in AWS S3, all metadata in PostgreSQL  
✅ No AI results exposed to students  
✅ Teachers can manually trigger detection and download results  

---

## Scope & Not Included

**Out of Scope:**
- Email notifications (future enhancement)
- Collaborative grading (multiple teachers per collection)
- Late submission penalties
- Integration with LMS (Canvas, Blackboard, etc.)
- Mobile app
- Plagiarism detection (only AI detection in scope)

---

## Implementation Order

1. Database migrations (collections, submissions, ai_detection_results tables)
2. Backend APIs (collection CRUD, submission endpoint, detection trigger)
3. FastAPI integration (call FastAPI for each file in submission)
4. Frontend: CreateCollectionPage + CollectionDetailsPage
5. Frontend: StudentSubmissionPage (public form)
6. End-to-end testing + refinement
7. Documentation

