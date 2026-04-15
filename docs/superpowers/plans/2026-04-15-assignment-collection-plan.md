# Assignment Collection with Auto-Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a complete teacher-student assignment submission workflow with optional automatic AI detection, all data stored in AWS S3 + PostgreSQL.

**Architecture:** Polling-based detection with immediate S3 upload of student files. Teachers create shareable links → students submit → detection runs (if enabled) → results appear in real-time dashboard via 4-second polls.

**Tech Stack:** Node.js/Express (backend), React (frontend), FastAPI (AI service), PostgreSQL (Supabase), AWS S3 (file storage)

---

## File Structure

### Backend Files
```
backend/
├── routes/
│   ├── collections.js (NEW) — Collection CRUD endpoints
│   └── submissions.js (NEW) — Student submission + detection endpoints
├── migrations/
│   ├── XXXX_create_collections_table.sql (NEW)
│   ├── XXXX_create_submissions_table.sql (NEW)
│   └── XXXX_create_ai_detection_results_table.sql (NEW)
├── utils/
│   └── collectionHelpers.js (NEW) — S3 + detection orchestration helpers
├── middleware/
│   └── (existing) — reuse existing auth middleware
└── server.js (MODIFY) — register new routes
```

### Frontend Files
```
frontend/src/
├── pages/
│   ├── CollectionsPage.jsx (NEW) — List user's collections
│   ├── CreateCollectionPage.jsx (NEW) — Create new collection link
│   ├── CollectionDetailsPage.jsx (NEW) — View results dashboard
│   └── StudentSubmissionPage.jsx (NEW) — Public submission form (no auth)
├── components/
│   ├── CollectionSummary.jsx (NEW) — Summary stats panel
│   ├── SubmissionList.jsx (NEW) — Submissions table with filters/sort
│   ├── SubmissionResultCard.jsx (NEW) — Detailed result view
│   └── StudentSubmissionForm.jsx (NEW) — File upload + metadata form
├── api/
│   └── collectionsApi.js (NEW) — API client for collection endpoints
├── App.jsx (MODIFY) — Add routes for new pages
└── context/
    └── (existing) — reuse AuthContext
```

---

## Phase 1: Database Layer (Migrations)

### Task 1: Create `collections` Table Migration

**Files:**
- Create: `backend/migrations/001_create_collections_table.sql`

- [ ] **Step 1: Create migration file with collections table schema**

```sql
-- backend/migrations/001_create_collections_table.sql

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

- [ ] **Step 2: Apply migration to Supabase**

Run from backend directory:
```bash
npx supabase migration up 001_create_collections_table
```

Expected: Migration succeeds, table visible in Supabase dashboard

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/001_create_collections_table.sql
git commit -m "migration: create collections table"
```

---

### Task 2: Create `submissions` Table Migration

**Files:**
- Create: `backend/migrations/002_create_submissions_table.sql`

- [ ] **Step 1: Create migration file with submissions table schema**

```sql
-- backend/migrations/002_create_submissions_table.sql

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

- [ ] **Step 2: Apply migration to Supabase**

```bash
npx supabase migration up 002_create_submissions_table
```

Expected: Migration succeeds, table visible in Supabase dashboard

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/002_create_submissions_table.sql
git commit -m "migration: create submissions table"
```

---

### Task 3: Create `ai_detection_results` Table Migration

**Files:**
- Create: `backend/migrations/003_create_ai_detection_results_table.sql`

- [ ] **Step 1: Create migration file with detection results schema**

```sql
-- backend/migrations/003_create_ai_detection_results_table.sql

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

- [ ] **Step 2: Apply migration to Supabase**

```bash
npx supabase migration up 003_create_ai_detection_results_table
```

Expected: Migration succeeds, table visible in Supabase dashboard

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/003_create_ai_detection_results_table.sql
git commit -m "migration: create ai_detection_results table"
```

---

## Phase 2: Backend API Layer

### Task 4: Create Collection Helper Utilities

**Files:**
- Create: `backend/utils/collectionHelpers.js`

- [ ] **Step 1: Write helper functions for S3 and detection orchestration**

```javascript
// backend/utils/collectionHelpers.js

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * Generate a unique, unguessable share code
 * @returns {string} 12-character alphanumeric code
 */
function generateShareCode() {
  return uuidv4().substring(0, 12).replace(/-/g, "");
}

/**
 * Upload a file to S3 in the collection folder
 * @param {Buffer} fileBuffer - File contents
 * @param {string} collectionId - Collection ID
 * @param {string} submissionId - Submission ID
 * @param {string} filename - Original filename
 * @returns {Promise<string>} S3 path (e.g., collections/uuid/uuid/filename)
 */
async function uploadToS3(fileBuffer, collectionId, submissionId, filename) {
  const s3Path = `collections/${collectionId}/${submissionId}/${filename}`;
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Path,
    Body: fileBuffer,
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    return s3Path;
  } catch (error) {
    console.error("S3 upload failed:", error);
    throw new Error(`Failed to upload ${filename} to S3`);
  }
}

/**
 * Call FastAPI service to detect AI in a file
 * @param {string} s3Path - S3 file path
 * @param {Buffer} fileBuffer - File contents for detection
 * @returns {Promise<Object>} Detection result {ai_score, verdict, confidence, chunk_scores, similarity_score}
 */
async function callAIDetection(s3Path, fileBuffer) {
  try {
    // Create FormData and send to FastAPI
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", fileBuffer, s3Path.split("/").pop());

    const response = await axios.post(
      `${process.env.FASTAPI_URL}/detect`,
      form,
      {
        headers: form.getHeaders(),
      }
    );

    return {
      ai_score: response.data.score || 0,
      verdict: response.data.verdict || "human",
      confidence: response.data.confidence || "low",
      chunk_scores: response.data.chunks || [],
      similarity_score: response.data.similarity_score || 0,
    };
  } catch (error) {
    console.error("FastAPI detection failed:", error);
    throw new Error("AI detection service unavailable");
  }
}

module.exports = {
  generateShareCode,
  uploadToS3,
  callAIDetection,
};
```

- [ ] **Step 2: Run basic validation (check syntax)**

```bash
node -c backend/utils/collectionHelpers.js
```

Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add backend/utils/collectionHelpers.js
git commit -m "util: add collection helpers for S3 and AI detection"
```

---

### Task 5: Create Collections Route (Create & Fetch)

**Files:**
- Create: `backend/routes/collections.js`

- [ ] **Step 1: Write collections endpoint for GET and POST**

```javascript
// backend/routes/collections.js

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { generateShareCode } = require("../utils/collectionHelpers");
const { supabase } = require("../data/supabaseClient");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/collections
 * Create a new assignment collection
 * Auth: Required
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, description, auto_detect_enabled, expires_at } = req.body;
    const userId = req.user.id;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Collection name is required" });
    }

    const shareCode = generateShareCode();

    const { data, error } = await supabase
      .from("collections")
      .insert([
        {
          user_id: userId,
          name,
          description: description || null,
          auto_detect_enabled: auto_detect_enabled !== false,
          expires_at: expires_at || null,
          unique_share_code: shareCode,
          status: "active",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Failed to create collection" });
    }

    res.status(201).json({
      id: data.id,
      shareCode: data.unique_share_code,
      name: data.name,
      auto_detect_enabled: data.auto_detect_enabled,
      created_at: data.created_at,
    });
  } catch (error) {
    console.error("POST /collections error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/collections
 * List all collections for authenticated user
 * Auth: Required
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from("collections")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase select error:", error);
      return res.status(500).json({ error: "Failed to fetch collections" });
    }

    res.json({ collections: data });
  } catch (error) {
    console.error("GET /collections error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/collections/:id
 * Get single collection details (for teacher viewing dashboard)
 * Auth: Required (must be owner)
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from("collections")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Collection not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("GET /collections/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
```

- [ ] **Step 2: Test endpoints with mock data**

```bash
# Test POST /api/collections (requires auth token)
curl -X POST http://localhost:5000/api/collections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{
    "name": "Assignment 1 - Poetry Analysis",
    "description": "Submit your 500-word poem analysis",
    "auto_detect_enabled": true
  }'
```

Expected: Returns 201 with collection id and shareCode

- [ ] **Step 3: Commit**

```bash
git add backend/routes/collections.js
git commit -m "feat: add collection CRUD endpoints (POST, GET, GET/:id)"
```

---

### Task 6: Create Collections Submissions Route (Fetch & Detect)

**Files:**
- Create: `backend/routes/submissions.js`

- [ ] **Step 1: Write submissions endpoint for GET (list with results) and POST (manual detect)**

```javascript
// backend/routes/submissions.js

const express = require("express");
const { supabase } = require("../data/supabaseClient");
const { callAIDetection } = require("../utils/collectionHelpers");
const { requireAuth } = require("../middleware/auth");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const router = express.Router();
const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * GET /api/collections/:collectionId/submissions
 * List all submissions for a collection with their detection results
 * Used for teacher dashboard polling
 * Auth: Required (must be collection owner)
 */
router.get("/:collectionId/submissions", requireAuth, async (req, res) => {
  try {
    const { collectionId } = req.params;
    const userId = req.user.id;

    // Verify user owns this collection
    const { data: collection, error: collError } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", userId)
      .single();

    if (collError || !collection) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get all submissions with their detection results
    const { data: submissions, error: subError } = await supabase
      .from("submissions")
      .select(
        `
        id,
        student_name,
        student_id,
        submitted_at,
        updated_at,
        ai_detection_results (
          filename,
          ai_score,
          verdict,
          confidence,
          chunk_scores,
          similarity_score,
          detection_status,
          detected_at,
          error_message
        )
      `
      )
      .eq("collection_id", collectionId)
      .order("submitted_at", { ascending: false });

    if (subError) {
      console.error("Supabase select error:", subError);
      return res.status(500).json({ error: "Failed to fetch submissions" });
    }

    // Transform to frontend format
    const formatted = submissions.map((sub) => ({
      id: sub.id,
      student_name: sub.student_name,
      student_id: sub.student_id || "N/A",
      submitted_at: sub.submitted_at,
      updated_at: sub.updated_at,
      files: sub.ai_detection_results.map((res) => ({
        filename: res.filename,
        ai_score: res.ai_score,
        verdict: res.verdict,
        confidence: res.confidence,
        chunk_scores: res.chunk_scores,
        similarity_score: res.similarity_score,
        detection_status: res.detection_status,
        detected_at: res.detected_at,
        error_message: res.error_message,
      })),
    }));

    res.json({
      submissions: formatted,
      count: formatted.length,
    });
  } catch (error) {
    console.error("GET /collections/:id/submissions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/collections/:collectionId/detect
 * Manually trigger AI detection on specific or all submissions
 * Body: { submissionIds?: string[] } — if empty, detect all pending
 * Auth: Required (must be collection owner)
 */
router.post("/:collectionId/detect", requireAuth, async (req, res) => {
  try {
    const { collectionId } = req.params;
    const { submissionIds } = req.body;
    const userId = req.user.id;

    // Verify ownership
    const { data: collection, error: collError } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", userId)
      .single();

    if (collError || !collection) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get submissions to detect
    let query = supabase
      .from("ai_detection_results")
      .select("id, submission_id, s3_file_path, filename")
      .eq("detection_status", "pending")
      .in(
        "submission_id",
        submissionIds || [] // If empty, below query will handle it
      );

    if (!submissionIds || submissionIds.length === 0) {
      // Get all pending detections in this collection
      query = supabase
        .from("ai_detection_results")
        .select("id, submission_id, s3_file_path, filename")
        .eq("detection_status", "pending");
    }

    const { data: pendingResults, error: queryError } = await query;

    if (queryError) {
      console.error("Query error:", queryError);
      return res.status(500).json({ error: "Failed to fetch pending detections" });
    }

    if (pendingResults.length === 0) {
      return res.json({ message: "No pending detections", processed: 0 });
    }

    // Process detections in background (don't wait for completion)
    processDetectionsAsync(pendingResults, collectionId);

    res.json({
      message: "Detection started",
      processing: pendingResults.length,
    });
  } catch (error) {
    console.error("POST /detect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Background function to process detections
 * Updates detection_status as it goes
 */
async function processDetectionsAsync(results, collectionId) {
  for (const result of results) {
    try {
      // Update status to processing
      await supabase
        .from("ai_detection_results")
        .update({ detection_status: "processing" })
        .eq("id", result.id);

      // Get file from S3 and run detection
      const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: result.s3_file_path,
        }),
        { expiresIn: 3600 }
      );

      // Fetch file from S3
      const fileResponse = await fetch(signedUrl);
      const fileBuffer = await fileResponse.buffer();

      // Call FastAPI
      const detection = await callAIDetection(result.s3_file_path, fileBuffer);

      // Update result
      await supabase
        .from("ai_detection_results")
        .update({
          detection_status: "completed",
          ai_score: detection.ai_score,
          verdict: detection.verdict,
          confidence: detection.confidence,
          chunk_scores: detection.chunk_scores,
          similarity_score: detection.similarity_score,
          detected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.id);

      console.log(`Detection completed for ${result.filename}`);
    } catch (error) {
      console.error(`Detection failed for ${result.filename}:`, error);

      // Update status to failed with error message
      await supabase
        .from("ai_detection_results")
        .update({
          detection_status: "failed",
          error_message: error.message || "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.id);
    }
  }
}

module.exports = router;
```

- [ ] **Step 2: Test GET endpoint with curl**

```bash
curl http://localhost:5000/api/collections/uuid-here/submissions \
  -H "Authorization: Bearer YOUR_TEST_TOKEN"
```

Expected: Returns submissions array with detection results

- [ ] **Step 3: Commit**

```bash
git add backend/routes/submissions.js
git commit -m "feat: add submissions list and manual detection trigger endpoints"
```

---

### Task 7: Create Public Submission Endpoint

**Files:**
- Modify: `backend/routes/submissions.js` (add new routes)

- [ ] **Step 1: Add public POST endpoint for student file submission**

```javascript
// Add to backend/routes/submissions.js

/**
 * POST /api/share/:shareCode/submit
 * Student submits files to a collection
 * Auth: None (public endpoint)
 * Uses multer to handle file uploads
 */
router.post("/share/:shareCode/submit", async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { student_name, student_id, student_notes } = req.body;
    const files = req.files || []; // Assuming multer middleware

    if (!student_name || student_name.trim() === "") {
      return res.status(400).json({ error: "Student name is required" });
    }

    if (files.length === 0) {
      return res.status(400).json({ error: "At least one file is required" });
    }

    // Find collection by share code
    const { data: collection, error: collError } = await supabase
      .from("collections")
      .select("id, auto_detect_enabled, expires_at")
      .eq("unique_share_code", shareCode)
      .eq("status", "active")
      .single();

    if (collError || !collection) {
      return res.status(404).json({ error: "Collection not found or expired" });
    }

    // Check deadline
    if (collection.expires_at && new Date(collection.expires_at) < new Date()) {
      return res.status(410).json({ error: "Collection submission deadline has passed" });
    }

    const submissionId = uuidv4();
    const { uploadToS3 } = require("../utils/collectionHelpers");

    // Upload all files to S3
    const s3Paths = [];
    for (const file of files) {
      const s3Path = await uploadToS3(
        file.buffer,
        collection.id,
        submissionId,
        file.originalname
      );
      s3Paths.push(s3Path);
    }

    // Create submission record
    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .insert([
        {
          collection_id: collection.id,
          student_name,
          student_id: student_id || null,
          student_notes: student_notes || null,
          s3_folder_path: `collections/${collection.id}/${submissionId}`,
        },
      ])
      .select()
      .single();

    if (subError) {
      console.error("Submission insert error:", subError);
      return res.status(500).json({ error: "Failed to save submission" });
    }

    // Create detection result records (one per file)
    const detectionRecords = files.map((file) => ({
      submission_id: submission.id,
      filename: file.originalname,
      s3_file_path: `collections/${collection.id}/${submissionId}/${file.originalname}`,
      detection_status: collection.auto_detect_enabled ? "pending" : "pending",
    }));

    const { error: detError } = await supabase
      .from("ai_detection_results")
      .insert(detectionRecords);

    if (detError) {
      console.error("Detection record insert error:", detError);
      return res.status(500).json({ error: "Failed to create detection records" });
    }

    // If auto-detect is enabled, trigger detection immediately
    if (collection.auto_detect_enabled) {
      // Don't await — process in background
      const { data: results } = await supabase
        .from("ai_detection_results")
        .select("id, s3_file_path, filename")
        .eq("submission_id", submission.id);

      if (results && results.length > 0) {
        processDetectionsAsync(results, collection.id);
      }
    }

    res.status(201).json({
      message: "Submission received. Teacher will review.",
      submission_id: submission.id,
      files_count: files.length,
    });
  } catch (error) {
    console.error("POST /share/:shareCode/submit error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/share/:shareCode
 * Check if a collection exists (for public link validation)
 * Auth: None
 */
router.get("/share/:shareCode", async (req, res) => {
  try {
    const { shareCode } = req.params;

    const { data, error } = await supabase
      .from("collections")
      .select("id, name, status")
      .eq("unique_share_code", shareCode)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Collection not found" });
    }

    if (data.status !== "active") {
      return res.status(410).json({ error: "Collection is no longer accepting submissions" });
    }

    res.json({
      id: data.id,
      name: data.name,
      valid: true,
    });
  } catch (error) {
    console.error("GET /share/:shareCode error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 2: Update server.js to register submission routes**

```javascript
// In backend/server.js, add:

const submissionsRouter = require("./routes/submissions");

// Mount the routes
app.use("/api/collections", require("./routes/collections"));
app.use("/api", submissionsRouter); // For /api/share/:shareCode and /api/collections/:id/submissions
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/submissions.js backend/server.js
git commit -m "feat: add public student submission endpoint with auto-detection trigger"
```

---

## Phase 3: Frontend Pages & Components

### Task 8: Create Collections List Page

**Files:**
- Create: `frontend/src/pages/CollectionsPage.jsx`

- [ ] **Step 1: Write collections page that lists all user's collections**

```javascript
// frontend/src/pages/CollectionsPage.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function CollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      const response = await fetch('/api/collections', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await response.json();
      setCollections(data.collections || []);
    } catch (err) {
      setError('Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Assignment Collections</h1>
            <p className="text-gray-400">Create and manage assignment submission links</p>
          </div>
          <button
            onClick={() => navigate('/collections/new')}
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-105 transition-transform"
          >
            + New Collection
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* Collections Grid */}
        {collections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No collections yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((col) => (
              <motion.div
                key={col.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => navigate(`/collections/${col.id}`)}
                className="p-6 bg-gray-900 border border-gray-800 rounded-2xl cursor-pointer hover:border-violet-500/50 transition-all group"
              >
                <h3 className="text-lg font-bold text-white mb-2 group-hover:text-violet-400 transition-colors">
                  {col.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">{col.description || 'No description'}</p>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{col.status}</span>
                  <span>{new Date(col.created_at).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test page displays collections**

Navigate to `/collections` in frontend. Should show list or "No collections yet" message.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CollectionsPage.jsx
git commit -m "feat: add collections list page"
```

---

### Task 9: Create Collection Details (Results Dashboard) Page

**Files:**
- Create: `frontend/src/pages/CollectionDetailsPage.jsx`
- Create: `frontend/src/components/CollectionSummary.jsx`
- Create: `frontend/src/components/SubmissionList.jsx`

- [ ] **Step 1: Write CollectionSummary component for stats**

```javascript
// frontend/src/components/CollectionSummary.jsx

import React from 'react';

export default function CollectionSummary({ submissions }) {
  const totalSubmissions = submissions.length;
  const aiDetectedCount = submissions.reduce((count, sub) => {
    const hasAI = sub.files.some((f) => f.verdict === 'ai');
    return hasAI ? count + 1 : count;
  }, 0);
  const aiRate = totalSubmissions > 0 ? Math.round((aiDetectedCount / totalSubmissions) * 100) : 0;

  const allScores = submissions.flatMap((s) => s.files.map((f) => f.ai_score).filter((s) => s !== null));
  const avgScore = allScores.length > 0 ? (allScores.reduce((a, b) => a + b) / allScores.length * 100).toFixed(1) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Total Submissions</p>
        <p className="text-3xl font-bold text-white">{totalSubmissions}</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">AI Detection Rate</p>
        <p className="text-3xl font-bold text-red-400">{aiRate}%</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Average AI Score</p>
        <p className="text-3xl font-bold text-orange-400">{avgScore}%</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-600 mb-1 uppercase tracking-widest">Model Used</p>
        <p className="text-sm font-bold text-violet-400">v1.0</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write SubmissionList component with table and filters**

```javascript
// frontend/src/components/SubmissionList.jsx

import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function SubmissionList({ submissions, onRunDetection }) {
  const [search, setSearch] = useState('');
  const [filterVerdictfilterVerdict, setFilterVerdict] = useState('all');
  const [sortBy, setSortBy] = useState('submitted_at');
  const [expandedId, setExpandedId] = useState(null);

  const filtered = submissions
    .filter((s) => s.student_name.toLowerCase().includes(search.toLowerCase()))
    .filter((s) => {
      if (filterVerdict === 'all') return true;
      const hasVerdict = s.files.some((f) => f.verdict === filterVerdict);
      return hasVerdict;
    })
    .sort((a, b) => {
      if (sortBy === 'submitted_at') return new Date(b.submitted_at) - new Date(a.submitted_at);
      if (sortBy === 'ai_score') {
        const scoreA = Math.max(...a.files.map((f) => f.ai_score || 0));
        const scoreB = Math.max(...b.files.map((f) => f.ai_score || 0));
        return scoreB - scoreA;
      }
      return 0;
    });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by student name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
        />
        <select
          value={filterVerdict}
          onChange={(e) => setFilterVerdict(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
        >
          <option value="all">All Verdicts</option>
          <option value="human">Human Written</option>
          <option value="mixed">Mixed</option>
          <option value="ai">AI Generated</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
        >
          <option value="submitted_at">Latest First</option>
          <option value="ai_score">Highest Score</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800">
            <tr className="text-xs text-gray-600 uppercase tracking-widest">
              <th className="text-left py-3 px-4">Student Name</th>
              <th className="text-center py-3 px-4">Files</th>
              <th className="text-center py-3 px-4">AI Score</th>
              <th className="text-center py-3 px-4">Status</th>
              <th className="text-center py-3 px-4">Verdict</th>
              <th className="text-center py-3 px-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((sub) => {
              const maxScore = Math.max(...sub.files.map((f) => f.ai_score || 0));
              const verdict = sub.files.find((f) => f.verdict === 'ai') ? 'ai' : sub.files.find((f) => f.verdict === 'mixed') ? 'mixed' : 'human';

              return (
                <motion.tr
                  key={sub.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-900/50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                >
                  <td className="py-3 px-4 text-white font-semibold">{sub.student_name}</td>
                  <td className="py-3 px-4 text-center text-gray-400">{sub.files.length}</td>
                  <td className="py-3 px-4 text-center font-mono text-orange-400">{Math.round(maxScore * 100)}%</td>
                  <td className="py-3 px-4 text-center">
                    {sub.files.some((f) => f.detection_status === 'processing') && (
                      <span className="text-xs text-blue-400">Processing</span>
                    )}
                    {sub.files.every((f) => f.detection_status === 'completed') && (
                      <span className="text-xs text-green-400">Completed</span>
                    )}
                    {sub.files.some((f) => f.detection_status === 'pending') && (
                      <span className="text-xs text-gray-500">Pending</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <VerdictBadge verdict={verdict} />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunDetection(sub.id);
                      }}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      Detect
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500">No submissions match your filters.</div>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }) {
  const cfg = {
    human: { label: 'Human Written', bg: 'bg-emerald-500/10 text-emerald-400' },
    mixed: { label: 'Mixed Content', bg: 'bg-amber-500/10 text-amber-400' },
    ai: { label: 'AI Generated', bg: 'bg-red-500/10 text-red-400' },
  }[verdict] || { label: '—', bg: 'bg-gray-800 text-gray-400' };

  return <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${cfg.bg}`}>{cfg.label}</span>;
}
```

- [ ] **Step 3: Write CollectionDetailsPage**

```javascript
// frontend/src/pages/CollectionDetailsPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import CollectionSummary from '../components/CollectionSummary';
import SubmissionList from '../components/SubmissionList';

export default function CollectionDetailsPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
    // Poll every 4 seconds for updates
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [id]);

  const fetchData = async () => {
    try {
      const colRes = await fetch(`/api/collections/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const collectionData = await colRes.json();
      setCollection(collectionData);

      const subRes = await fetch(`/api/collections/${id}/submissions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const submissionsData = await subRes.json();
      setSubmissions(submissionsData.submissions || []);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRunDetection = async (submissionId) => {
    try {
      await fetch(`/api/collections/${id}/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ submissionIds: [submissionId] }),
      });
      // Refetch immediately to show processing status
      await fetchData();
    } catch (err) {
      setError('Failed to trigger detection');
    }
  };

  const handleRunAllDetection = async () => {
    try {
      await fetch(`/api/collections/${id}/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({}),
      });
      await fetchData();
    } catch (err) {
      setError('Failed to trigger bulk detection');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" /></div>;
  }

  if (!collection) {
    return <div className="text-center py-8 text-red-400">Collection not found</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">{collection.name}</h1>
          <p className="text-gray-400 mb-4">{collection.description}</p>
          <div className="flex gap-4">
            <span className="text-sm text-gray-500">Auto-detect: {collection.auto_detect_enabled ? '✓ ON' : '✗ OFF'}</span>
            <span className="text-sm text-gray-500">Status: {collection.status}</span>
          </div>
        </div>

        {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 mb-6">{error}</div>}

        {/* Share Link */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 mb-8">
          <p className="text-xs text-gray-500 uppercase mb-2">Share Link</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/submit/${collection.unique_share_code}`}
              className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm"
            />
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/submit/${collection.unique_share_code}`)}
              className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-500"
            >
              Copy
            </button>
          </div>
        </motion.div>

        {/* Summary */}
        <CollectionSummary submissions={submissions} />

        {/* Bulk Actions */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={handleRunAllDetection}
            className="px-6 py-2 bg-violet-600 text-white font-bold rounded-xl hover:scale-105 transition-transform"
          >
            Run All Detections
          </button>
          <button
            onClick={() => downloadCSV(submissions)}
            className="px-6 py-2 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition"
          >
            Download CSV
          </button>
        </div>

        {/* Submissions Table */}
        <SubmissionList submissions={submissions} onRunDetection={handleRunDetection} />
      </div>
    </div>
  );
}

function downloadCSV(submissions) {
  const rows = [
    ['Student Name', 'Student ID', 'File Count', 'Max AI Score', 'Verdict', 'Submitted At'],
    ...submissions.map((s) => [
      s.student_name,
      s.student_id,
      s.files.length,
      Math.round(Math.max(...s.files.map((f) => f.ai_score || 0)) * 100),
      s.files.find((f) => f.verdict === 'ai') ? 'AI' : s.files.find((f) => f.verdict === 'mixed') ? 'Mixed' : 'Human',
      new Date(s.submitted_at).toISOString(),
    ]),
  ];

  const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'results.csv';
  a.click();
}
```

- [ ] **Step 4: Test page polls and updates**

Open collection details page. Should show summary and table. Results should update every 4 seconds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CollectionDetailsPage.jsx frontend/src/components/CollectionSummary.jsx frontend/src/components/SubmissionList.jsx
git commit -m "feat: add collection details dashboard with summary and submission list"
```

---

### Task 10: Create Student Submission Page

**Files:**
- Create: `frontend/src/pages/StudentSubmissionPage.jsx`
- Create: `frontend/src/components/StudentSubmissionForm.jsx`

- [ ] **Step 1: Write StudentSubmissionForm component**

```javascript
// frontend/src/components/StudentSubmissionForm.jsx

import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';

export default function StudentSubmissionForm({ collectionName, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    student_name: '',
    student_id: '',
    student_notes: '',
  });
  const [files, setFiles] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const onDrop = (acceptedFiles) => {
    setFiles(acceptedFiles.slice(0, 5));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'text/plain': [],
    },
    maxFiles: 5,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.student_name.trim() || files.length === 0) {
      alert('Please enter your name and select at least one file.');
      return;
    }

    const formDataToSend = new FormData();
    formDataToSend.append('student_name', formData.student_name);
    formDataToSend.append('student_id', formData.student_id);
    formDataToSend.append('student_notes', formData.student_notes);
    files.forEach((file) => formDataToSend.append('files', file));

    await onSubmit(formDataToSend);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-emerald-400 mb-2">Submission Received!</h3>
        <p className="text-emerald-300 text-sm">Your assignment has been submitted successfully. Your teacher will review it shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Student Name */}
      <div>
        <label className="block text-sm font-bold text-white mb-2">Your Name *</label>
        <input
          type="text"
          required
          value={formData.student_name}
          onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
          placeholder="Enter your full name"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
        />
      </div>

      {/* Student ID */}
      <div>
        <label className="block text-sm font-bold text-white mb-2">Student ID (Optional)</label>
        <input
          type="text"
          value={formData.student_id}
          onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
          placeholder="e.g., 12345678"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-bold text-white mb-2">Notes (Optional)</label>
        <textarea
          value={formData.student_notes}
          onChange={(e) => setFormData({ ...formData, student_notes: e.target.value })}
          placeholder="Add any comments or notes about your submission..."
          rows="3"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none resize-none"
        />
      </div>

      {/* File Upload */}
      <div>
        <label className="block text-sm font-bold text-white mb-2">Upload Files *</label>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
            isDragActive ? 'border-violet-500 bg-violet-500/5' : 'border-gray-800 hover:border-gray-700'
          }`}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">
            {isDragActive ? 'Drop files here' : 'Select or drag files'}
          </p>
          <p className="text-xs text-gray-500">PDF, DOCX, or TXT • Max 5 files</p>
        </div>
      </div>

      {/* Selected Files */}
      {files.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase mb-3">Selected Files</p>
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-sm text-gray-300">
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-gray-600">{(f.size / 1024).toFixed(1)}KB</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setFiles([])}
            className="mt-3 text-xs text-gray-500 hover:text-white transition"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !formData.student_name || files.length === 0}
        className="w-full py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-[1.01] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Submitting...' : 'Submit Assignment'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write StudentSubmissionPage (public page)**

```javascript
// frontend/src/pages/StudentSubmissionPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import StudentSubmissionForm from '../components/StudentSubmissionForm';

export default function StudentSubmissionPage() {
  const { shareCode } = useParams();
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCollection();
  }, [shareCode]);

  const fetchCollection = async () => {
    try {
      const response = await fetch(`/api/share/${shareCode}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Collection not found');
      }
      setCollection(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/share/${shareCode}/submit`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Submission failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-red-400 mb-2">Oops!</h2>
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!collection) {
    return <div className="text-center py-8 text-red-400">Collection not found</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-4">
      <div className="max-w-2xl mx-auto py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">{collection.name}</h1>
          <p className="text-gray-400 text-lg">Submit your assignment below</p>
        </div>

        {/* Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8">
          <StudentSubmissionForm collectionName={collection.name} onSubmit={handleSubmit} isLoading={isSubmitting} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add routes to App.jsx**

```javascript
// In frontend/src/App.jsx, add:

import CollectionsPage from './pages/CollectionsPage';
import CreateCollectionPage from './pages/CreateCollectionPage';
import CollectionDetailsPage from './pages/CollectionDetailsPage';
import StudentSubmissionPage from './pages/StudentSubmissionPage';

// Add to router:
<Route path="/collections" element={<ProtectedRoute><CollectionsPage /></ProtectedRoute>} />
<Route path="/collections/new" element={<ProtectedRoute><CreateCollectionPage /></ProtectedRoute>} />
<Route path="/collections/:id" element={<ProtectedRoute><CollectionDetailsPage /></ProtectedRoute>} />
<Route path="/submit/:shareCode" element={<StudentSubmissionPage />} />
```

- [ ] **Step 4: Test student submission page**

Navigate to `/submit/{any-share-code}` (without auth). Should show submission form or collection not found.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/StudentSubmissionPage.jsx frontend/src/components/StudentSubmissionForm.jsx frontend/src/App.jsx
git commit -m "feat: add public student submission page with form"
```

---

### Task 11: Create Collection Creation Page

**Files:**
- Create: `frontend/src/pages/CreateCollectionPage.jsx`
- Create: `frontend/src/api/collectionsApi.js`

- [ ] **Step 1: Write collections API client**

```javascript
// frontend/src/api/collectionsApi.js

export async function createCollection(data) {
  const response = await fetch('/api/collections', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create collection');
  }

  return await response.json();
}

export async function fetchCollectionDetails(id) {
  const response = await fetch(`/api/collections/${id}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch collection');
  }

  return await response.json();
}
```

- [ ] **Step 2: Write CreateCollectionPage**

```javascript
// frontend/src/pages/CreateCollectionPage.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createCollection } from '../api/collectionsApi';

export default function CreateCollectionPage() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    auto_detect_enabled: true,
    expires_at: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Collection name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await createCollection(formData);
      setSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
        <div className="max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-12 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-emerald-400 mb-4">Collection Created!</h2>
            <p className="text-emerald-300 mb-6">Share this link with your students:</p>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/submit/${success.shareCode}`}
                className="w-full px-4 py-3 bg-black text-white text-center font-mono text-sm rounded-lg"
              />
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/submit/${success.shareCode}`)}
                className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition"
              >
                Copy Link
              </button>
              <button
                onClick={() => navigate(`/collections/${success.id}`)}
                className="px-6 py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-500 transition"
              >
                Go to Dashboard
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Create New Collection</h1>
          <p className="text-gray-400">Set up an assignment collection link for your students</p>
        </div>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-800 rounded-3xl p-8 space-y-6"
        >
          {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}

          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-white mb-2">Collection Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Assignment 1 - Poetry Analysis"
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-white mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the assignment or provide instructions..."
              rows="4"
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-violet-500 outline-none resize-none"
            />
          </div>

          {/* Auto-detect Toggle */}
          <div>
            <label className="flex items-center gap-4">
              <input
                type="checkbox"
                checked={formData.auto_detect_enabled}
                onChange={(e) => setFormData({ ...formData, auto_detect_enabled: e.target.checked })}
                className="w-5 h-5 rounded accent-violet-600"
              />
              <span className="text-sm font-bold text-white">
                Auto-detect AI in submissions
                <span className="block text-xs text-gray-500 font-normal">Detection runs automatically when students submit</span>
              </span>
            </label>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-bold text-white mb-2">Deadline (Optional)</label>
            <input
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white focus:border-violet-500 outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={() => navigate('/collections')}
              className="flex-1 px-6 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Collection'}
            </button>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Test creating a collection**

Navigate to `/collections/new`. Fill form and submit. Should show success with shareable link.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CreateCollectionPage.jsx frontend/src/api/collectionsApi.js
git commit -m "feat: add create collection page with form"
```

---

## Phase 4: Integration & Testing

### Task 12: End-to-End Test

**Files:**
- Create: `tests/e2e/assignment-collection.test.js`

- [ ] **Step 1: Write E2E test for full flow**

```javascript
// tests/e2e/assignment-collection.test.js

describe('Assignment Collection E2E', () => {
  test('Teacher creates link → Student submits → Auto-detection runs', async () => {
    // 1. Teacher creates collection
    const createRes = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer teacher-token' },
      body: JSON.stringify({
        name: 'Test Assignment',
        description: 'Test',
        auto_detect_enabled: true,
      }),
    });
    const { id, shareCode } = await createRes.json();
    expect(createRes.status).toBe(201);

    // 2. Student submits via share code
    const formData = new FormData();
    formData.append('student_name', 'John Doe');
    formData.append('student_id', '12345');
    formData.append('student_notes', 'My submission');
    formData.append('files', new File(['test content'], 'test.txt'));

    const submitRes = await fetch(`/api/share/${shareCode}/submit`, {
      method: 'POST',
      body: formData,
    });
    expect(submitRes.status).toBe(201);

    // 3. Teacher checks dashboard
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for detection

    const subRes = await fetch(`/api/collections/${id}/submissions`, {
      headers: { Authorization: 'Bearer teacher-token' },
    });
    const { submissions } = await subRes.json();
    expect(submissions.length).toBe(1);
    expect(submissions[0].files[0].detection_status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/e2e/assignment-collection.test.js
```

Expected: Test passes

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/assignment-collection.test.js
git commit -m "test: add E2E test for assignment collection workflow"
```

---

### Task 13: Final Integration & Testing

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 2: Test full UI flow manually**

1. Create collection via UI
2. Copy share link
3. Submit file as student
4. Check dashboard for results
5. Verify polling updates

- [ ] **Step 3: Test error cases**

- Invalid collection code
- Missing student name
- No files selected
- Auto-detect toggle OFF

- [ ] **Step 4: Final commit**

```bash
git status
git add .
git commit -m "feat: complete assignment collection phase 2 implementation"
```

---

## Success Criteria

✅ Teachers can create shareable collection links  
✅ Students can submit files without login  
✅ Auto-detection runs (if enabled) when students submit  
✅ Teachers see real-time results via 4-second polling  
✅ All files stored in AWS S3, metadata in PostgreSQL  
✅ Filtering/sorting works in dashboard  
✅ Manual detection trigger works  
✅ CSV export works  
✅ No AI results shown to students  

