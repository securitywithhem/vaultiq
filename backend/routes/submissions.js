// backend/routes/submissions.js

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../data/supabaseClient");
const { uploadToS3 } = require("../utils/collectionHelpers");
const { processDetectionsAsync } = require("../utils/detectionHelper");
const { requireAuth } = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

/**
 * POST /api/share/:shareCode/submit
 * Student submits files to a collection
 * Auth: None (public endpoint)
 * Uses multer to handle file uploads
 */
router.post("/:shareCode/submit", upload.array("files"), async (req, res) => {
  try {
    const { shareCode } = req.params;
    const { student_name, student_id, student_notes } = req.body;
    const files = req.files || []; // From multer middleware

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
      detection_status: "pending",
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
router.get("/:shareCode", async (req, res) => {
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

module.exports = router;
