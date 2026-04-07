/**
 * @file files.js
 * @description File upload, download, list, and delete routes
 * @dependencies express, multer, crypto, s3, supabase, hdfsLogger, auth, validate
 * @exports router
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { fileIdParams } = require('../validators/files.schema');
const { encrypt, decrypt, sha256, createDecipher } = require('../utils/crypto');
const { uploadToS3, downloadFromS3, deleteFromS3 } = require('../utils/s3');
const { supabaseAdmin } = require('../utils/supabase');
const { logEvent } = require('../utils/hdfsLogger');
const logger = require('../utils/logger');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB — enforced at multer level
});

// ─── Constants ──────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.macro-enabled.document',
  'text/plain',
  'text/markdown',
  'application/rtf',
  'text/rtf'
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.docm', '.txt', '.md', '.rtf'];

// ─── Helpers ────────────────────────────────────────────────────────
function sanitizeFilename(filename) {
  let sanitized = path.basename(filename);
  sanitized = sanitized.replace(/[^a-zA-Z0-9._\-]/g, '_');
  return sanitized.slice(0, 255);
}

/**
 * Transform stream that extracts the first 16 bytes (IV) from the stream,
 * then creates a decipher and pipes the remaining ciphertext through it.
 * Used for large-file streaming downloads.
 */
class IVExtractorStream extends Transform {
  constructor(onIVExtracted) {
    super();
    this._ivBuffer = Buffer.alloc(0);
    this._ivExtracted = false;
    this._onIVExtracted = onIVExtracted;
  }

  _transform(chunk, encoding, callback) {
    if (this._ivExtracted) {
      // IV already extracted, pass ciphertext through
      this.push(chunk);
      return callback();
    }

    this._ivBuffer = Buffer.concat([this._ivBuffer, chunk]);

    if (this._ivBuffer.length >= 16) {
      const iv = this._ivBuffer.slice(0, 16);
      const remaining = this._ivBuffer.slice(16);
      this._ivExtracted = true;
      this._ivBuffer = null; // free memory

      this._onIVExtracted(iv);

      if (remaining.length > 0) {
        this.push(remaining);
      }
      callback();
    } else {
      // Need more data for IV
      callback();
    }
  }

  _flush(callback) {
    if (!this._ivExtracted && this._ivBuffer && this._ivBuffer.length > 0) {
      // Stream ended before we got 16 bytes — corrupted file
      callback(new Error('File corruption: IV incomplete'));
    } else {
      callback();
    }
  }
}

// Fire-and-forget log (never blocks the response)
function asyncLog(eventData) {
  logEvent(eventData).catch(err => {
    logger.error('HDFS log failed', { error: err.message });
  });
}

// ─── POST /upload ───────────────────────────────────────────────────
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      logger.warn('Upload rejected — bad MIME type', {
        requestId: req.id, mime: req.file.mimetype, filename: req.file.originalname
      });
      return res.status(400).json({ error: 'Unsupported file type. Allowed: PDF, DOCX, TXT, Markdown, RTF' });
    }

    // Validate extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file extension' });
    }

    const sanitizedFilename = sanitizeFilename(req.file.originalname);
    const uniqueId = crypto.randomUUID();
    const s3Key = `${req.user.id}/${Date.now()}_${uniqueId}_${sanitizedFilename}.enc`;

    // Hash before encryption (for integrity verification)
    const sha256Hash = sha256(req.file.buffer);

    // Encrypt and prepend IV
    const { data: encrypted, iv } = encrypt(req.file.buffer);
    const finalData = Buffer.concat([iv, encrypted]);

    // Upload to S3
    await uploadToS3(s3Key, finalData, req.file.mimetype);

    // Store metadata in Supabase
    const { data: fileRecord, error: dbError } = await supabaseAdmin
      .from('files')
      .insert({
        user_id: req.user.id,
        filename: sanitizedFilename,
        s3_key: s3Key,
        file_size: req.file.size,
        mime_type: req.file.mimetype || 'application/octet-stream',
        sha256_hash: sha256Hash
      })
      .select('id, filename, file_size, uploaded_at, sha256_hash')
      .single();

    if (dbError) {
      logger.error('DB error on upload', { requestId: req.id, error: dbError.message });
      return res.status(500).json({ error: 'Database error storing file record' });
    }

    asyncLog({
      event: 'upload',
      user_id: req.user.id,
      filename: sanitizedFilename,
      file_size: req.file.size,
      timestamp: Date.now(),
      ip: req.ip
    });

    logger.info('File uploaded', { requestId: req.id, fileId: fileRecord.id, size: req.file.size });
    return res.status(201).json({ data: { file: fileRecord } });
  } catch (err) {
    logger.error('Upload error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET / (list files) ─────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('id, filename, file_size, mime_type, sha256_hash, uploaded_at')
      .eq('user_id', req.user.id)
      .order('uploaded_at', { ascending: false });

    if (error) {
      logger.error('DB error listing files', { requestId: req.id, error: error.message });
      return res.status(500).json({ error: 'Failed to fetch files' });
    }

    return res.status(200).json({ data: { files: files || [] } });
  } catch (err) {
    logger.error('List files error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/download ─────────────────────────────────────────────
router.get('/:id/download', authenticateToken, validate(fileIdParams), async (req, res) => {
  try {
    // Fetch file record — IDOR protection: filter by user_id
    const { data: file, error: fetchError } = await supabaseAdmin
      .from('files')
      .select('id, user_id, filename, file_size, mime_type, sha256_hash, s3_key')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id) // IDOR protection at query level
      .single();

    if (fetchError || !file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const { body, metadata, isStream } = await downloadFromS3(file.s3_key);

    // Set headers ONCE
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');

    if (isStream) {
      // ─── Large file: stream-mode decryption ───────────────
      // S3 returns raw stream with prepended IV (first 16 bytes).
      // IVExtractorStream reads IV, then pipes ciphertext through decipher.
      const ivExtractor = new IVExtractorStream((iv) => {
        const decipher = createDecipher(iv);
        ivExtractor.pipe(decipher).pipe(res);

        decipher.on('error', (decErr) => {
          logger.error('Decryption stream error', { requestId: req.id, error: decErr.message });
          if (!res.headersSent) {
            res.status(500).json({ error: 'Decryption failed' });
          }
        });
      });

      body.pipe(ivExtractor);

      body.on('error', (streamErr) => {
        logger.error('S3 stream error', { requestId: req.id, error: streamErr.message });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      });

      asyncLog({
        event: 'download',
        user_id: req.user.id,
        filename: file.filename,
        file_size: file.file_size,
        timestamp: Date.now(),
        ip: req.ip
      });

      return; // Response handled by pipe
    }

    // ─── Small file: buffer-mode decryption ───────────────
    if (!metadata?.iv) {
      return res.status(500).json({ error: 'Missing encryption metadata' });
    }

    const plaintext = decrypt(body, metadata.iv);

    // Integrity check
    const hash = sha256(plaintext);
    if (hash !== file.sha256_hash) {
      logger.error('Integrity check failed', {
        requestId: req.id, fileId: file.id, expected: file.sha256_hash, got: hash
      });
      return res.status(409).json({ error: 'Integrity check failed — file may be corrupted' });
    }

    asyncLog({
      event: 'download',
      user_id: req.user.id,
      filename: file.filename,
      file_size: file.file_size,
      timestamp: Date.now(),
      ip: req.ip
    });

    return res.send(plaintext);
  } catch (err) {
    logger.error('Download error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validate(fileIdParams), async (req, res) => {
  try {
    // IDOR protection: filter by user_id at query level
    const { data: file, error: fetchError } = await supabaseAdmin
      .from('files')
      .select('id, user_id, filename, s3_key, file_size')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !file) {
      return res.status(404).json({ error: 'File not found' });
    }

    await deleteFromS3(file.s3_key);

    const { error: deleteError } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('id', file.id); // Use fetched file.id, not req.params.id

    if (deleteError) {
      logger.error('DB delete error', { requestId: req.id, error: deleteError.message });
      return res.status(500).json({ error: 'Failed to delete file record' });
    }

    asyncLog({
      event: 'delete',
      user_id: req.user.id,
      filename: file.filename,
      file_size: file.file_size,
      timestamp: Date.now(),
      ip: req.ip
    });

    logger.info('File deleted', { requestId: req.id, fileId: file.id });
    return res.status(200).json({ data: { message: 'File deleted' } });
  } catch (err) {
    logger.error('Delete error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
