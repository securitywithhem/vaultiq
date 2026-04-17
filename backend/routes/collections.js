const express = require("express");
const { generateShareCode } = require("../utils/collectionHelpers");
const { createClient } = require("@supabase/supabase-js");
const { processDetectionsAsync } = require("../utils/detectionHelper");
const { authenticateToken } = require("../middleware/auth");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

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
    console.log('📨 POST /collections received');
    console.log('👤 User ID:', req.user?.id);
    console.log('📝 Request body:', req.body);

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
      console.error("❌ No user ID found in request");
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
    console.log('🔑 Generated share code:', shareCode);

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
    console.log('📋 Insert data:', JSON.stringify(insertData, null, 2));

    const { data, error } = await supabase
      .from("collections")
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error("❌ Supabase insert error:", error);
      console.error("   Error code:", error.code);
      console.error("   Error message:", error.message);
      console.error("   Error details:", error);
      return res.status(500).json({ error: "Failed to create collection: " + error.message });
    }

    console.log(`✅ Collection created with ID: ${data.id}`);
    console.log('   Share code in response:', data.unique_share_code);
    console.log('   Full response data:', JSON.stringify(data, null, 2));

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
    console.log('📤 Sending response:', JSON.stringify(responseData, null, 2));
    res.status(201).json(responseData);
  } catch (error) {
    console.error("❌ POST /collections error:", error);
    console.error("   Stack:", error.stack);
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
      console.error("Supabase select error:", error);
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
    console.error("GET /collections error:", error);
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
    console.error("GET /collections/:id error:", error);
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

    // Then get pending detections only for this collection
    let query = supabase
      .from("ai_detection_results")
      .select("id, submission_id, s3_file_path, filename")
      .eq("detection_status", "pending")
      .in("submission_id", validSubmissionIds);

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
      console.error("Supabase select error:", subError);
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
                console.error("Signed URL error:", e.message);
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
    console.error("GET /collections/:id/submissions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
