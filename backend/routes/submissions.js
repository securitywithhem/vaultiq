/**
 * @file submissions.js
 * @description Submission management and AI detection routes
 * @dependencies express, supabase, auth middleware, collectionHelpers, AWS S3
 * @exports router
 */

const express = require("express");
const { supabaseAdmin } = require("../utils/supabase");
const { callAIDetection } = require("../utils/collectionHelpers");
const { authenticateToken } = require("../middleware/auth");
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
router.get("/:collectionId/submissions", authenticateToken, async (req, res) => {
  try {
    const { collectionId } = req.params;
    const userId = req.user.id;

    // Verify user owns this collection
    const { data: collection, error: collError } = await supabaseAdmin
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", userId)
      .single();

    if (collError || !collection) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get all submissions with their detection results
    const { data: submissions, error: subError } = await supabaseAdmin
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
router.post("/:collectionId/detect", authenticateToken, async (req, res) => {
  try {
    const { collectionId } = req.params;
    const { submissionIds } = req.body;
    const userId = req.user.id;

    // Verify ownership
    const { data: collection, error: collError } = await supabaseAdmin
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", userId)
      .single();

    if (collError || !collection) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get submissions to detect
    let query = supabaseAdmin
      .from("ai_detection_results")
      .select("id, submission_id, s3_file_path, filename")
      .eq("detection_status", "pending");

    if (submissionIds && submissionIds.length > 0) {
      query = query.in("submission_id", submissionIds);
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
 * Updates detection_status: pending → processing → completed (or failed with error_message)
 * @param {Array} results - Array of detection results to process
 * @param {string} collectionId - Collection ID for logging
 */
async function processDetectionsAsync(results, collectionId) {
  for (const result of results) {
    try {
      // Update status to processing
      await supabaseAdmin
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
      await supabaseAdmin
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
      await supabaseAdmin
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
