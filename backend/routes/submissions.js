// backend/routes/submissions.js

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../data/supabaseClient");
const { uploadToS3 } = require("../utils/collectionHelpers");
const { processDetectionsAsync } = require("../utils/detectionHelper");
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

/**
 * POST /api/share/:shareCode/submit
 * Student submits files to a collection
 * Auth: None (public endpoint)
 */
router.post("/:shareCode/submit", handleUpload, async (req, res) => {
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

    console.log('📤 POST /share/:shareCode/submit received');
    console.log('   Share code:', shareCode);
    console.log('   Student name:', student_name);
    console.log('   Student email:', student_email);
    console.log('   Files count:', files.length);

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

    // File size + type validation
    const maxBytes = (collection.max_file_size_mb || 25) * 1024 * 1024;
    const allowedTypes = (collection.allowed_types || ["pdf", "docx", "txt"]).map((t) => t.toLowerCase());
    for (const file of files) {
      if (file.size > maxBytes) {
        return res.status(413).json({
          error: `File "${file.originalname}" exceeds ${collection.max_file_size_mb}MB limit`,
        });
      }
      const ext = (file.originalname.split(".").pop() || "").toLowerCase();
      if (!allowedTypes.includes(ext)) {
        return res.status(415).json({
          error: `File type ".${ext}" is not allowed. Allowed: ${allowedTypes.join(", ")}`,
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
    console.log('🔍 GET /share/:shareCode requested');
    console.log('   Share code:', shareCode);
    console.log('   Share code type:', typeof shareCode);
    console.log('   Share code length:', shareCode?.length);

    const { data, error } = await supabase
      .from("collections")
      .select("id, name, description, status, fields, max_file_size_mb, allowed_types, expires_at")
      .eq("unique_share_code", shareCode)
      .single();

    if (error) {
      console.error('❌ Query error:', error);
      console.error('   Error code:', error.code);
      console.error('   Error message:', error.message);
      return res.status(404).json({ error: "Collection not found" });
    }

    if (!data) {
      console.error('❌ No data returned from query');
      return res.status(404).json({ error: "Collection not found" });
    }

    console.log('✅ Collection found:', data.id, data.name);

    if (data.status !== "active") {
      console.warn('⚠️  Collection status is not active:', data.status);
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
    console.log('📤 Sending collection info:', responseData);
    res.json(responseData);
  } catch (error) {
    console.error("❌ GET /share/:shareCode error:", error);
    console.error("   Stack:", error.stack);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
