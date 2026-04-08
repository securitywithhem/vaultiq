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
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000
      });
      
      logger.info('AI Detection executed', {
        requestId: req.id,
        filesCount: req.files.length,
        userId: req.user?.id || 'unknown'
      });

      logEvent('ai_detection', {
        userId: req.user?.id || req.user?.userId,
        ipAddress: req.ip,
        metadata: { filesCount: req.files.length }
      }).catch(() => {}); // fire-and-forget, never blocks response

      return res.status(200).json({
        results: response.data,
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
