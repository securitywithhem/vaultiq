// AI Detection routes
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { logEvent } = require('../utils/hdfsLogger');
const { supabaseAdmin } = require('../utils/supabase');
const { decrypt, sha256 } = require('../utils/crypto');
const { downloadFromS3 } = require('../utils/s3');
const logger = require('../utils/logger');

// ─── Local AI detection store (fallback when event_logs table absent) ─────────
const AI_STORE_PATH = path.resolve(__dirname, '../../backend/data/ai_detections.json');

function appendAIResult(userId, results) {
  try {
    let store = { detections: [] };
    try { store = JSON.parse(fs.readFileSync(AI_STORE_PATH, 'utf8')); } catch { /* missing or corrupt store — start fresh */ }
    for (const r of results) {
      if (r.status === 'error') continue;
      store.detections.push({
        timestamp:  new Date().toISOString(),
        user_id:    userId,
        filename:   r.filename,
        verdict:    r.verdict,
        score:      r.score,
        confidence: r.confidence,
      });
    }
    // Keep last 500 entries
    if (store.detections.length > 500) store.detections = store.detections.slice(-500);
    fs.writeFileSync(AI_STORE_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    // fire-and-forget — never crash the request
  }
}

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// ─── Shared helper: forward files buffer array to AI service ─────────────────
async function callAIService(fileBuffers) {
  // fileBuffers: [{ buffer, filename, mimetype }]
  const form = new FormData();
  for (const f of fileBuffers) {
    form.append('files', f.buffer, { filename: f.filename, contentType: f.mimetype });
  }

  const response = await axios.post(`${AI_SERVICE_URL}/detect`, form, {
    headers: { ...form.getHeaders() },
    timeout: 60_000,
  });

  const aiData = response.data;
  const results      = Array.isArray(aiData) ? aiData              : (aiData.results      ?? aiData);
  const modelWarning = Array.isArray(aiData) ? null                : (aiData.model_warning ?? null);
  return { results, modelWarning };
}

// ─── POST / — detect from direct upload ─────────────────────────────────────
router.post('/', authenticateToken, upload.array('files', 5), async (req, res) => {
  const start = Date.now();
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // MIME type validation for AI detection
    const ALLOWED_AI_MIME = new Set(['application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain']);

    for (const f of req.files) {
      const ext = path.extname(f.originalname).toLowerCase();
      if (!['.pdf', '.docx', '.txt'].includes(ext) || !ALLOWED_AI_MIME.has(f.mimetype)) {
        return res.status(415).json({ error: `File type not allowed: ${f.originalname}` });
      }
    }

    const fileBuffers = req.files.map(f => ({
      buffer:   f.buffer,
      filename: f.originalname,
      mimetype: f.mimetype,
    }));

    let results, modelWarning;
    try {
      ({ results, modelWarning } = await callAIService(fileBuffers));
    } catch (axErr) {
      logger.error('AI Service error (upload)', { error: axErr.message });
      return res.status(503).json({
        error: 'AI Service is currently unavailable.',
        details: process.env.NODE_ENV === 'development' ? axErr.message : 'Please try again later',
      });
    }

    logger.info('AI Detection (upload)', { requestId: req.id, filesCount: req.files.length });

    logEvent('ai_detection', {
      userId:    req.user?.id,
      ipAddress: req.ip,
      aiVerdict: results?.[0]?.verdict ?? null,
      aiScore:   results?.[0]?.score   ?? null,
      durationMs: Date.now() - start,
      metadata:  { filesCount: req.files.length },
    }).catch(() => {});

    appendAIResult(req.user?.id, results);
    return res.status(200).json({ results, model_warning: modelWarning, processed_at: new Date().toISOString() });
  } catch (err) {
    logger.error('AI detect upload error', { error: err.message });
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── POST /from-vault — detect on already-uploaded vault files ───────────────
router.post('/from-vault', authenticateToken, async (req, res) => {
  const start = Date.now();
  try {
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'fileIds must be a non-empty array' });
    }
    if (fileIds.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 files can be analysed at once' });
    }

    // Fetch file records — IDOR protection: filter by user_id
    const { data: files, error: dbErr } = await supabaseAdmin
      .from('files')
      .select('id, filename, s3_key, mime_type, sha256_hash, file_size')
      .in('id', fileIds)
      .eq('user_id', req.user.id);

    if (dbErr) {
      logger.error('from-vault DB fetch error', { error: dbErr.message });
      return res.status(500).json({ error: 'Failed to look up vault files' });
    }

    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'No matching vault files found' });
    }

    // Supported extensions for AI detection
    const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.txt']);

    const fileBuffers = [];
    const skipped = [];

    for (const file of files) {
      const ext = path.extname(file.filename).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) {
        skipped.push({ filename: file.filename, error: `Unsupported type: ${ext}. Accepted: .pdf .docx .txt` });
        continue;
      }

      try {
        // Download + decrypt from S3
        const { body, metadata, isStream } = await downloadFromS3(file.s3_key);

        let plaintext;
        if (isStream) {
          // Buffer the stream
          const chunks = [];
          for await (const chunk of body) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const full = Buffer.concat(chunks);
          const iv = full.slice(0, 16);
          const cipher = full.slice(16);
          const { decrypt: dec } = require('../utils/crypto');
          plaintext = dec(cipher, iv);
        } else {
          plaintext = decrypt(body, metadata.iv);
        }

        // Integrity check
        const hash = sha256(plaintext);
        if (hash !== file.sha256_hash) {
          skipped.push({ filename: file.filename, error: 'Integrity check failed — file may be tampered.' });
          continue;
        }

        fileBuffers.push({
          buffer:   plaintext,
          filename: file.filename,
          mimetype: file.mime_type || 'application/octet-stream',
        });
      } catch (dlErr) {
        logger.error('from-vault download/decrypt error', { fileId: file.id, error: dlErr.message });
        skipped.push({ filename: file.filename, error: 'Failed to retrieve file from vault' });
      }
    }

    let results = [];
    let modelWarning = null;

    if (fileBuffers.length > 0) {
      try {
        ({ results, modelWarning } = await callAIService(fileBuffers));
      } catch (axErr) {
        logger.error('AI Service error (from-vault)', { error: axErr.message });
        return res.status(503).json({
          error: 'AI Service is currently unavailable.',
          details: process.env.NODE_ENV === 'development' ? axErr.message : 'Please try again later',
        });
      }
    }

    // Append skipped entries as error results
    for (const s of skipped) {
      results.push({ filename: s.filename, status: 'error', error: s.error });
    }

    logEvent('ai_detection', {
      userId:    req.user?.id,
      ipAddress: req.ip,
      aiVerdict: results?.[0]?.verdict ?? null,
      aiScore:   results?.[0]?.score   ?? null,
      durationMs: Date.now() - start,
      metadata:  { filesCount: files.length, source: 'vault' },
    }).catch(() => {});

    logger.info('AI Detection (from-vault)', { requestId: req.id, filesCount: fileBuffers.length });

    appendAIResult(req.user?.id, results);
    return res.status(200).json({ results, model_warning: modelWarning, processed_at: new Date().toISOString() });
  } catch (err) {
    logger.error('from-vault error', { error: err.message });
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── POST /check — raw text detection ───────────────────────────────────────
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim?.()) {
      return res.status(400).json({ error: 'Text content cannot be empty' });
    }

    if (text.length > 50_000) {
      return res.status(413).json({ error: 'Text too large (max 50,000 characters)' });
    }

    const response = await axios.post(`${AI_SERVICE_URL}/detect/text`, {
      text,
      document_id: req.id || 'AI detection',
    }, { timeout: 30_000 });

    return res.status(response.status).json(response.data);
  } catch (err) {
    logger.error('AI detect check error', { requestId: req.id, error: err.message });
    return res.status(502).json({ error: 'AI Service connection failed' });
  }
});

// ─── GET /history — user's AI detection history ──────────────────────────────
router.get('/history', authenticateToken, (req, res) => {
  try {
    let store = { detections: [] };
    try { store = JSON.parse(fs.readFileSync(AI_STORE_PATH, 'utf8')); } catch { /* missing or corrupt store — start fresh */ }
    const userDetections = (store.detections || [])
      .filter(d => d.user_id === req.user.id)
      .reverse(); // most recent first
    return res.status(200).json({ detections: userDetections });
  } catch (err) {
    logger.error('AI history error', { error: err.message });
    return res.status(500).json({ error: 'Failed to load history' });
  }
});

// ─── POST /add — analysis corpus stub ───────────────────────────────────────
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { doc_id, text } = req.body;

    if (!doc_id || typeof doc_id !== 'string' || doc_id.length > 128) {
      return res.status(400).json({ error: 'doc_id must be a string (max 128 chars)' });
    }
    if (!text || typeof text !== 'string' || text.length > 50_000) {
      return res.status(400).json({ error: 'text must be a non-empty string (max 50,000 chars)' });
    }

    const response = await axios.post(`${AI_SERVICE_URL}/analysis/add`, {
      doc_id, text, title: '',
    }, { timeout: 15_000 });
    return res.status(response.status).json(response.data);
  } catch (err) {
    logger.error('AI detect add error', { requestId: req.id, error: err.message });
    return res.status(502).json({ error: 'AI Service connection failed' });
  }
});

module.exports = router;
