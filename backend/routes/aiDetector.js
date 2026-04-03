/**
 * @file aiDetector.js
 * @description Proxy routes for forwarding AI Content Detection requests to the Python service
 * @dependencies express, node-fetch, form-data, multer, auth middleware
 * @exports router
 */

const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

/**
 * POST /api/ai-detect/train
 * Forwards training requests to the AI service.
 */
router.post('/train', authenticateToken, async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[aiDetector.train]', err.message);
    return res.status(500).json({ error: 'AI Service connection failed' });
  }
});

/**
 * POST /api/ai-detect/check
 * Forwards file upload detection requests.
 */
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

    const response = await fetch(`${AI_SERVICE_URL}/detect`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[aiDetector.check]', err.message);
    return res.status(500).json({ error: 'AI Service detection failed' });
  }
});

/**
 * POST /api/ai-detect/check-text
 * Forwards raw text detection requests.
 */
router.post('/check-text', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text content is required' });
    }

    const response = await fetch(`${AI_SERVICE_URL}/detect-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[aiDetector.checkText]', err.message);
    return res.status(500).json({ error: 'AI Service text detection failed' });
  }
});

/**
 * GET /api/ai-detect/status
 * Public health check for the AI service.
 */
router.get('/status', async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/health`, { timeout: 2000 });
    const data = await response.json();
    return res.status(200).json({ 
      online: true, 
      model_trained: data.model_trained,
      training_report: data.training_report 
    });
  } catch (err) {
    // Service is unreachable
    return res.status(200).json({ 
      online: false, 
      model_trained: false 
    });
  }
});

module.exports = router;
