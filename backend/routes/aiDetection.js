// AI Detection Module — integrated 2026-04-08
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { logEvent } = require('../utils/hdfsLogger');
const logger = require('../utils/logger');

const router = express.Router();

const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

router.post('/', authenticateToken, upload.array('files', 5), async (req, res) => {
  const start = Date.now(); // Fix 6: latency tracking
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Prepare FormData
    const form = new FormData();
    req.files.forEach((file) => {
      form.append('files', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
    });

    try {
      const response = await axios.post(`${AI_SERVICE_URL}/detect`, form, {
        headers: { ...form.getHeaders() },
        timeout: 30000
      });

      // Fix 4: FastAPI now returns { results: [...], model_warning: str|null }
      // Support both old list format and new object format for robustness.
      const aiData = response.data;
      const results     = Array.isArray(aiData) ? aiData : (aiData.results ?? aiData);
      const modelWarning = Array.isArray(aiData) ? null  : (aiData.model_warning ?? null);

      logger.info('AI Detection executed', {
        requestId: req.id,
        filesCount: req.files.length,
        userId: req.user?.id || 'unknown'
      });

      // Fix 5: pass verdict + score so HDFS analytics are populated
      // Fix 6: pass durationMs so latency_analysis shows data
      logEvent('ai_detection', {
        userId:    req.user?.id || req.user?.userId,
        ipAddress: req.ip,
        aiVerdict: results?.[0]?.verdict ?? null,
        aiScore:   results?.[0]?.score   ?? null,
        durationMs: Date.now() - start,
        metadata:  { filesCount: req.files.length }
      }).catch(() => {}); // fire-and-forget, never blocks response

      return res.status(200).json({
        results,
        model_warning: modelWarning, // Fix 4: surface to frontend
        processed_at: new Date().toISOString()
      });
    } catch (axErr) {
      logger.error('Python AI Service Error', { error: axErr.message });
      return res.status(503).json({
        error: 'AI Service is currently unavailable. Please check if it is running.',
        details: axErr.message
      });
    }

  } catch (err) {
    logger.error('Detection request handled err', { error: err.message });
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
