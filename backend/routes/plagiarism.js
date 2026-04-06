/**
 * @file plagiarism.js
 * @description Proxy routes for forwarding Plagiarism Detection requests to the AI service
 * @dependencies express, node-fetch, auth middleware
 * @exports router
 */

const express = require('express');
const fetch = require('node-fetch');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

/**
 * POST /api/plagiarism/check
 * Forwards text to the AI service for similarity analysis.
 */
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text content is required' });
    }

    const response = await fetch(`${AI_SERVICE_URL}/plagiarism/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[plagiarism.check]', err.message);
    return res.status(500).json({ error: 'AI Service connection failed' });
  }
});

/**
 * POST /api/plagiarism/add
 * Adds a document to the AI service corpus.
 * Usually called internally after a successful file upload.
 */
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { doc_id, text } = req.body;
    if (!doc_id || !text) {
      return res.status(400).json({ error: 'doc_id and text are required' });
    }

    const response = await fetch(`${AI_SERVICE_URL}/plagiarism/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id, text })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[plagiarism.add]', err.message);
    return res.status(500).json({ error: 'AI Service connection failed' });
  }
});

module.exports = router;
