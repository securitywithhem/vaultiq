// backend/routes/submissions.js

const express = require("express");
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../data/supabaseClient");
const { uploadToS3 } = require("../utils/collectionHelpers");
const { processDetectionsAsync } = require("../utils/detectionHelper");
const { logEvent } = require("../utils/hdfsLogger");
const logger = require("../utils/logger");
const axios = require("axios");

const router = express.Router();

// Configure multer with explicit error handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // hard cap 100MB; per-collection limit applied later
});

const handleUpload = (req, res, next) => {
  upload.array("files", 10)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message || "File upload failed" });
    }
    next();
  });
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asyncLog(eventType, payload) {
  logEvent(eventType, payload).catch(() => {});
}

/**
 * POST /api/share/:shareCode/submit
 * Student submits files to a collection
 * Auth: None (public endpoint)
 */
router.post("/:shareCode/submit", handleUpload, async (req, res) => {
  const start = Date.now();
  try {
    const { shareCode } = req.params;
    const {
      student_name,
      student_id,
      student_email,
      student_notes,
      custom_fields,
    } = req.body;
    const files = req.files || [];

    if (!student_name || student_name.trim() === "") {
      return res.status(400).json({ error: "Student name is required" });
    }
    if (!student_email || !emailRegex.test(student_email.trim())) {
      return res.status(400).json({ error: "A valid email address is required" });
    }
    if (files.length === 0) {
      return res.status(400).json({ error: "At least one file is required" });
    }

    // Find collection
    const { data: collection, error: collError } = await supabase
      .from("collections")
      .select("id, auto_detect_enabled, expires_at, fields, max_file_size_mb, allowed_types")
      .eq("unique_share_code", shareCode)
      .eq("status", "active")
      .single();

    if (collError || !collection) {
      return res.status(404).json({ error: "Collection not found or expired" });
    }

    // Deadline check
    if (collection.expires_at && new Date(collection.expires_at) < new Date()) {
      return res.status(410).json({ error: "Collection submission deadline has passed" });
    }

    // MIME type mapping for validation
    const EXTENSION_MIME_MAP = {
      pdf: ['application/pdf'],
      docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      txt: ['text/plain'],
      md: ['text/plain', 'text/markdown'],
      rtf: ['application/rtf', 'text/rtf'],
    };

    // File size + type validation
    const maxBytes = (collection.max_file_size_mb || 25) * 1024 * 1024;
    const allowedTypes = (collection.allowed_types || ["pdf", "docx", "txt"]).map((t) => t.toLowerCase());
    for (const file of files) {
      if (file.size > maxBytes) {
        return res.status(413).json({
          error: `File "${file.originalname}" exceeds ${collection.max_file_size_mb}MB limit`,
        });
      }
      const parts = file.originalname.split('.');
      const ext = (parts[parts.length - 1] || "").toLowerCase();

      // Check extension
      if (!allowedTypes.includes(ext)) {
        return res.status(415).json({
          error: `File type ".${ext}" is not allowed. Allowed: ${allowedTypes.join(", ")}`,
        });
      }

      // Check for double extensions (security: prevent polyglot files)
      if (parts.length > 2) {
        return res.status(415).json({
          error: 'Files with multiple extensions are not allowed',
        });
      }

      // Validate MIME type matches extension
      const allowedMimes = EXTENSION_MIME_MAP[ext] || [];
      if (allowedMimes.length > 0 && !allowedMimes.includes(file.mimetype)) {
        return res.status(415).json({
          error: `File MIME type mismatch for ".${ext}" files`,
        });
      }
    }

    // Parse and validate custom fields
    let parsedCustom = {};
    if (custom_fields) {
      try {
        parsedCustom = typeof custom_fields === "string" ? JSON.parse(custom_fields) : custom_fields;
      } catch {
        return res.status(400).json({ error: "Invalid custom_fields payload" });
      }
    }
    const definedFields = Array.isArray(collection.fields) ? collection.fields : [];
    for (const f of definedFields) {
      if (f.required) {
        const val = parsedCustom[f.id];
        if (val === undefined || val === null || String(val).trim() === "") {
          return res.status(400).json({ error: `Field "${f.label}" is required` });
        }
      }
    }

    const submissionId = uuidv4();

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
          student_name: student_name.trim(),
          student_id: student_id ? student_id.trim() : null,
          student_email: student_email.trim(),
          student_notes: student_notes || null,
          custom_fields: parsedCustom,
          s3_folder_path: `collections/${collection.id}/${submissionId}`,
        },
      ])
      .select()
      .single();

    if (subError) {
      logger.error("Submission insert error:", subError);
      return res.status(500).json({ error: "Failed to save submission" });
    }

    // Create detection result records (one per file)
    const detectionRecords = files.map((file) => ({
      submission_id: submission.id,
      filename: file.originalname,
      s3_file_path: `collections/${collection.id}/${submissionId}/${file.originalname}`,
      detection_status: "pending",
    }));

    const { error: detError } = await supabase
      .from("ai_detection_results")
      .insert(detectionRecords);

    if (detError) {
      logger.error("Detection record insert error:", detError);
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

    // Log submission event for Big Data analytics
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    asyncLog('submission', {
      userId: student_email || 'anonymous',
      fileName: files.map(f => f.originalname).join(', '),
      fileSizeBytes: totalBytes,
      fileType: files.length > 0 ? path.extname(files[0].originalname) : 'unknown',
      ipAddress: req.ip,
      durationMs: Date.now() - start,
    });

    res.status(201).json({
      message: "Submission received. Teacher will review.",
      submission_id: submission.id,
      files_count: files.length,
    });
  } catch (error) {
    logger.error("POST /share/:shareCode/submit error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/share/:shareCode
 * Check if a collection exists (for public link validation)
 * Auth: None
 */
router.get("/:shareCode", async (req, res) => {
  try {
    const { shareCode } = req.params;

    const { data, error } = await supabase
      .from("collections")
      .select("id, name, description, status, fields, max_file_size_mb, allowed_types, expires_at")
      .eq("unique_share_code", shareCode)
      .single();

    if (error) {
      return res.status(404).json({ error: "Collection not found" });
    }

    if (!data) {
      return res.status(404).json({ error: "Collection not found" });
    }

    if (data.status !== "active") {
      return res.status(410).json({ error: "Collection is no longer accepting submissions" });
    }

    const deadlinePassed = data.expires_at && new Date(data.expires_at) < new Date();
    if (deadlinePassed) {
      return res.status(410).json({ error: "Collection submission deadline has passed" });
    }

    const responseData = {
      id: data.id,
      name: data.name,
      description: data.description || "",
      valid: true,
      fields: data.fields || [],
      maxFileSizeMb: data.max_file_size_mb || 25,
      allowedTypes: data.allowed_types || ["pdf", "docx", "txt"],
      deadline: data.expires_at || null,
    };
    res.json(responseData);
  } catch (error) {
    logger.error("❌ GET /share/:shareCode error:", error);
    logger.error("   Stack:", error.stack);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
