/**
 * @file aiDetector.js
 * @description Proxy routes for forwarding AI Content Detection requests to the Python service
 * @dependencies express, node-fetch, form-data, multer, auth middleware, validate, logger
 * @exports router
 */

const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { checkTextSchema } = require('../validators/aiDetector.schema');
const logger = require('../utils/logger');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// ─── POST /check (file upload) ──────────────────────────────────────
router.post('/check', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    // AI service file detection endpoint is /detect/file (not /detect)
    const response = await fetch(`${AI_SERVICE_URL}/detect/file`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      timeout: 30000
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    logger.error('AI detect file error', { requestId: req.id, error: err.message });
    return res.status(502).json({ error: 'AI Service detection failed' });
  }
});

// ─── POST /check-text ───────────────────────────────────────────────
router.post('/check-text', authenticateToken, validate(checkTextSchema), async (req, res) => {
  try {
    const { text } = req.body;

    // AI service text detection endpoint is /detect (not /detect-text)
    const response = await fetch(`${AI_SERVICE_URL}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, document_id: req.id || 'text-check' }),
      timeout: 30000
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    logger.error('AI detect text error', { requestId: req.id, error: err.message });
    return res.status(502).json({ error: 'AI Service text detection failed' });
  }
});

// ─── GET /status (public health check) ─────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/health`, { timeout: 3000 });
    const data = await response.json();
    return res.status(200).json({
      data: {
        online: true,
        models_loaded: data.models_loaded || false,
      }
    });
  } catch {
    return res.status(200).json({
      data: { online: false, models_loaded: false }
    });
  }
});

module.exports = router;
