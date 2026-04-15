/**
 * @file collections.js
 * @description Assignment collection CRUD routes
 * @dependencies express, uuid, collectionHelpers, supabase, auth middleware
 * @exports router
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { generateShareCode } = require("../utils/collectionHelpers");
const { supabaseAdmin } = require("../utils/supabase");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

/**
 * POST /api/collections
 * Create a new assignment collection
 * Auth: Required
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, description, auto_detect_enabled, expires_at } = req.body;
    const userId = req.user.id;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Collection name is required" });
    }

    const shareCode = generateShareCode();

    const { data, error } = await supabaseAdmin
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
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
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
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
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
