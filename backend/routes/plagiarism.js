/**
 * @file plagiarism.js
 * @description Proxy routes for forwarding Plagiarism Detection requests to the AI service
 * @dependencies express, node-fetch, auth middleware, validate, logger
 * @exports router
 */

const express = require('express');
const fetch = require('node-fetch');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { checkSchema, addSchema } = require('../validators/plagiarism.schema');
const logger = require('../utils/logger');

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// ─── POST /check ────────────────────────────────────────────────────
router.post('/check', authenticateToken, validate(checkSchema), async (req, res) => {
  try {
    const { text } = req.body;

    // AI service /detect endpoint requires both text and document_id
    const response = await fetch(`${AI_SERVICE_URL}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, document_id: req.id || 'plagiarism-check' }),
      timeout: 30000 // 30s timeout for AI processing
    });

    if (!response.ok) {
      logger.warn('AI plagiarism check returned error', {
        requestId: req.id, status: response.status
      });
    }

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    logger.error('Plagiarism check error', { requestId: req.id, error: err.message });
    return res.status(502).json({ error: 'AI Service connection failed' });
  }
});

// ─── POST /add ──────────────────────────────────────────────────────
router.post('/add', authenticateToken, validate(addSchema), async (req, res) => {
  try {
    const { doc_id, text } = req.body;

    // AI service corpus endpoint expects doc_id, text, and optional title
    const response = await fetch(`${AI_SERVICE_URL}/corpus/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id, text, title: '' }),
      timeout: 15000
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    logger.error('Plagiarism add error', { requestId: req.id, error: err.message });
    return res.status(502).json({ error: 'AI Service connection failed' });
  }
});

module.exports = router;
