const express = require("express");
const { generateShareCode } = require("../utils/collectionHelpers");
const { createClient } = require("@supabase/supabase-js");
const { processDetectionsAsync } = require("../utils/detectionHelper");
const { authenticateToken } = require("../middleware/auth");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const logger = require("../utils/logger");

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Apply authentication to all routes
router.use(authenticateToken);

// Middleware to check auth
const requireAuth = (req, res, next) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

/**
 * POST /api/collections
 * Create a new assignment collection (authenticated)
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      name,
      description,
      auto_detect_enabled,
      expires_at,
      fields,
      max_file_size_mb,
      allowed_types,
    } = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Collection name is required" });
    }

    // Normalise optional structured inputs
    const normalisedFields = Array.isArray(fields)
      ? fields
          .filter((f) => f && typeof f.label === "string" && f.label.trim())
          .map((f, i) => ({
            id: f.id || `field_${i}_${Date.now()}`,
            label: f.label.trim(),
            type: ["text", "email", "number", "textarea", "select"].includes(f.type) ? f.type : "text",
            required: Boolean(f.required),
            options: Array.isArray(f.options) ? f.options.filter((o) => typeof o === "string") : [],
          }))
      : [];

    const sizeMb = Number.isFinite(Number(max_file_size_mb)) ? Math.min(Math.max(Number(max_file_size_mb), 1), 100) : 25;
    const normalisedTypes = Array.isArray(allowed_types) && allowed_types.length
      ? allowed_types.map((t) => String(t).toLowerCase().replace(/^\./, ""))
      : ["pdf", "docx", "txt"];

    const shareCode = generateShareCode();

    const insertData = {
      user_id: userId,
      name,
      description: description || null,
      auto_detect_enabled: auto_detect_enabled !== false,
      expires_at: expires_at || null,
      unique_share_code: shareCode,
      status: "active",
      fields: normalisedFields,
      max_file_size_mb: sizeMb,
      allowed_types: normalisedTypes,
    };

    const { data, error } = await supabase
      .from("collections")
      .insert([insertData])
      .select()
      .single();

    if (error) {
      logger.error('Collection creation failed', { requestId: req.id, error: error.message });
      return res.status(500).json({ error: "Failed to create collection" });
    }

    const responseData = {
      data: {
        id: data.id,
        name: data.name,
        shareCode: data.unique_share_code,
        autoDetectEnabled: data.auto_detect_enabled,
        fields: data.fields || [],
        maxFileSizeMb: data.max_file_size_mb,
        allowedTypes: data.allowed_types || [],
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      },
    };
    logger.info('Collection created', { requestId: req.id, collectionId: data.id });
    res.status(201).json(responseData);
  } catch (error) {
    logger.error('POST /collections error', { requestId: req.id, error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/collections
 * List all collections for authenticated user
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
      logger.error("Supabase select error:", error);
      return res.status(500).json({ error: "Failed to fetch collections" });
    }

    const collectionIds = data.map((c) => c.id);
    const counts = {};
    if (collectionIds.length) {
      const { data: subs } = await supabase
        .from("submissions")
        .select("collection_id")
        .in("collection_id", collectionIds);
      (subs || []).forEach((s) => {
        counts[s.collection_id] = (counts[s.collection_id] || 0) + 1;
      });
    }

    res.json({
      data: {
        collections: data.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          autoDetectEnabled: c.auto_detect_enabled,
          status: c.status,
          createdAt: c.created_at,
          expiresAt: c.expires_at,
          shareCode: c.unique_share_code,
          submissionCount: counts[c.id] || 0,
          maxFileSizeMb: c.max_file_size_mb,
          allowedTypes: c.allowed_types || [],
        })),
      },
    });
  } catch (error) {
    logger.error("GET /collections error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/collections/:id
 * Get single collection details (teacher dashboard)
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

    res.json({
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        autoDetectEnabled: data.auto_detect_enabled,
        status: data.status,
        shareCode: data.unique_share_code,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        fields: data.fields || [],
        maxFileSizeMb: data.max_file_size_mb,
        allowedTypes: data.allowed_types || [],
      },
    });
  } catch (error) {
    logger.error("GET /collections/:id error:", error);
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

    // First get submission IDs for this collection
    const { data: collectionSubmissions } = await supabase
      .from("submissions")
      .select("id")
      .eq("collection_id", collectionId);

    const validSubmissionIds = collectionSubmissions?.map(s => s.id) || [];

    // Then get pending or failed detections for this collection (retry failed ones)
    let query = supabase
      .from("ai_detection_results")
      .select("id, submission_id, s3_file_path, filename")
      .in("detection_status", ["pending", "failed"])
      .in("submission_id", validSubmissionIds);

    if (submissionIds && submissionIds.length > 0) {
      query = query.in("submission_id", submissionIds);
    }

    const { data: pendingResults, error: queryError } = await query;

    if (queryError) {
      logger.error("Query error:", queryError);
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
    logger.error("POST /detect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /api/collections/:id
 * Update an existing collection's settings
 * Auth: Required (must be collection owner)
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      name,
      description,
      auto_detect_enabled,
      expires_at,
      status,
      max_file_size_mb,
      allowed_types,
      fields,
    } = req.body;

    // Verify ownership
    const { data: collection, error: collError } = await supabase
      .from("collections")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (collError || !collection) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Build update object with only provided fields
    const updateData = {};
    if (typeof name !== "undefined" && name !== null)
      updateData.name = String(name).trim();
    if (typeof description !== "undefined")
      updateData.description = description ? String(description).trim() : null;
    if (typeof auto_detect_enabled !== "undefined")
      updateData.auto_detect_enabled = Boolean(auto_detect_enabled);
    if (typeof expires_at !== "undefined")
      updateData.expires_at = expires_at || null;
    if (typeof status !== "undefined" && ["active", "closed", "archived"].includes(status))
      updateData.status = status;
    if (typeof max_file_size_mb !== "undefined")
      updateData.max_file_size_mb = Math.min(
        Math.max(Number(max_file_size_mb), 1),
        100
      );
    if (typeof allowed_types !== "undefined" && Array.isArray(allowed_types))
      updateData.allowed_types = allowed_types.map((t) => String(t).toLowerCase());
    if (typeof fields !== "undefined" && Array.isArray(fields)) {
      updateData.fields = fields
        .filter((f) => f && typeof f.label === "string" && f.label.trim())
        .map((f, i) => ({
          id: f.id || `field_${i}_${Date.now()}`,
          label: f.label.trim(),
          type: ["text", "email", "number", "textarea", "select"].includes(f.type)
            ? f.type
            : "text",
          required: Boolean(f.required),
          options: Array.isArray(f.options)
            ? f.options.filter((o) => typeof o === "string")
            : [],
        }));
    }

    updateData.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("collections")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      logger.error("Collection update failed", {
        requestId: req.id,
        error: updateError.message,
      });
      return res.status(500).json({ error: "Failed to update collection" });
    }

    logger.info("Collection updated", {
      requestId: req.id,
      collectionId: id,
    });

    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        autoDetectEnabled: updated.auto_detect_enabled,
        status: updated.status,
        shareCode: updated.unique_share_code,
        createdAt: updated.created_at,
        expiresAt: updated.expires_at,
        fields: updated.fields || [],
        maxFileSizeMb: updated.max_file_size_mb,
        allowedTypes: updated.allowed_types || [],
      },
    });
  } catch (error) {
    logger.error("PATCH /collections/:id error", {
      requestId: req.id,
      error: error.message,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /api/collections/:collectionId/submissions/bulk-status
 * Bulk update review status for multiple submissions
 * Auth: Required (must be collection owner)
 * NOTE: Must come before /:submissionId route to match correctly
 */
router.patch("/:collectionId/submissions/bulk-status", requireAuth, async (req, res) => {
  try {
    const { collectionId } = req.params;
    const { submissionIds, review_status } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ error: "submissionIds must be a non-empty array" });
    }

    const validStatuses = ["unreviewed", "reviewed", "flagged", "approved"];
    if (!validStatuses.includes(review_status)) {
      return res.status(400).json({ error: "Invalid review status" });
    }

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

    const { error: updateError } = await supabase
      .from("submissions")
      .update({ review_status, updated_at: new Date().toISOString() })
      .eq("collection_id", collectionId)
      .in("id", submissionIds);

    if (updateError) {
      logger.error("Bulk status update error", {
        requestId: req.id,
        error: updateError.message,
      });
      return res.status(500).json({ error: "Failed to update submissions" });
    }

    logger.info("Bulk submission status updated", {
      requestId: req.id,
      count: submissionIds.length,
      status: review_status,
    });

    res.json({
      message: "Updated",
      updated: submissionIds.length,
    });
  } catch (error) {
    logger.error("PATCH bulk-status error", {
      requestId: req.id,
      error: error.message,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/collections/:collectionId/submissions/bulk
 * Bulk delete submissions
 * Auth: Required (must be collection owner)
 * NOTE: Must come before /:submissionId route to match correctly
 */
router.delete("/:collectionId/submissions/bulk", requireAuth, async (req, res) => {
  try {
    const { collectionId } = req.params;
    const { submissionIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ error: "submissionIds must be a non-empty array" });
    }

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

    const { error: deleteError } = await supabase
      .from("submissions")
      .delete()
      .eq("collection_id", collectionId)
      .in("id", submissionIds);

    if (deleteError) {
      logger.error("Bulk delete error", {
        requestId: req.id,
        error: deleteError.message,
      });
      return res.status(500).json({ error: "Failed to delete submissions" });
    }

    logger.info("Bulk submissions deleted", {
      requestId: req.id,
      count: submissionIds.length,
    });

    res.json({
      message: "Deleted",
      deleted: submissionIds.length,
    });
  } catch (error) {
    logger.error("DELETE bulk error", {
      requestId: req.id,
      error: error.message,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /api/collections/:collectionId/submissions/:submissionId
 * Update a submission's review status
 * Auth: Required (must be collection owner)
 * NOTE: Must come after bulk routes since this is more general
 */
router.patch("/:collectionId/submissions/:submissionId", requireAuth, async (req, res) => {
  try {
    const { collectionId, submissionId } = req.params;
    const { review_status } = req.body;
    const userId = req.user.id;

    const validStatuses = ["unreviewed", "reviewed", "flagged", "approved"];
    if (!validStatuses.includes(review_status)) {
      return res.status(400).json({ error: "Invalid review status" });
    }

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

    const { data: updated, error: updateError } = await supabase
      .from("submissions")
      .update({ review_status, updated_at: new Date().toISOString() })
      .eq("id", submissionId)
      .eq("collection_id", collectionId)
      .select()
      .single();

    if (updateError || !updated) {
      return res.status(404).json({ error: "Submission not found" });
    }

    logger.info("Submission status updated", {
      requestId: req.id,
      submissionId,
      status: review_status,
    });

    res.json({
      message: "Updated",
      review_status: updated.review_status,
    });
  } catch (error) {
    logger.error("PATCH submission status error", {
      requestId: req.id,
      error: error.message,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

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
        student_email,
        student_notes,
        custom_fields,
        review_status,
        submitted_at,
        updated_at,
        ai_detection_results (
          filename,
          s3_file_path,
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
      logger.error("Supabase select error:", subError);
      return res.status(500).json({ error: "Failed to fetch submissions" });
    }

    // Transform to frontend format (with signed download URLs)
    const formatted = await Promise.all(
      submissions.map(async (sub) => ({
        id: sub.id,
        student_name: sub.student_name,
        student_id: sub.student_id || "N/A",
        student_email: sub.student_email || null,
        student_notes: sub.student_notes || null,
        custom_fields: sub.custom_fields || {},
        review_status: sub.review_status || "unreviewed",
        submitted_at: sub.submitted_at,
        updated_at: sub.updated_at,
        files: await Promise.all(
          sub.ai_detection_results.map(async (res) => {
            let downloadUrl = null;
            if (res.s3_file_path) {
              try {
                downloadUrl = await getSignedUrl(
                  s3Client,
                  new GetObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: res.s3_file_path,
                  }),
                  { expiresIn: 900 }
                );
              } catch (e) {
                logger.error("Signed URL error:", e.message);
              }
            }
            return {
              filename: res.filename,
              download_url: downloadUrl,
              ai_score: res.ai_score,
              verdict: res.verdict,
              confidence: res.confidence,
              chunk_scores: res.chunk_scores,
              similarity_score: res.similarity_score,
              detection_status: res.detection_status,
              detected_at: res.detected_at,
              error_message: res.error_message,
            };
          })
        ),
      }))
    );

    res.json({
      submissions: formatted,
      count: formatted.length,
    });
  } catch (error) {
    logger.error("GET /collections/:id/submissions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
