const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { generateShareCode } = require("../utils/collectionHelpers");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

    console.log(`✓ Collection created: ${data.id}`);
    res.status(201).json({
      data: {
        id: data.id,
        name: data.name,
        shareCode: data.unique_share_code,
        autoDetectEnabled: data.auto_detect_enabled,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error("POST /collections error:", error);
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
      },
    });
  } catch (error) {
    console.error("GET /collections/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
