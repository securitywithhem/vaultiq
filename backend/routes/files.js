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
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
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
function asyncLog(eventType, payload) {
  logEvent(eventType, payload).catch(err => {
    logger.error('HDFS log failed', { error: err.message });
  });
}

// ─── POST /upload ───────────────────────────────────────────────────
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  const start = Date.now(); // Fix 6: latency tracking
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
      logger.error('DB error on upload (Detailed)', { 
        requestId: req.id, 
        code: dbError.code, 
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
        userId: req.user.id
      });
      return res.status(500).json({ error: `Database error: ${dbError.message}` });
    }

    asyncLog('file_upload', {
      userId: req.user.id,
      fileName: sanitizedFilename,
      fileSizeBytes: req.file.size,
      fileType: ext,
      ipAddress: req.ip,
      durationMs: Date.now() - start, // Fix 6
    });

    logger.info('File uploaded', { requestId: req.id, fileId: fileRecord.id, size: req.file.size });
    return res.status(201).json({ data: { file: fileRecord } });
  } catch (err) {
    logger.error('Upload error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /stats ─────────────────────────────────────────────────────
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { data, error, count } = await supabaseAdmin
      .from('files')
      .select('file_size', { count: 'exact' })
      .eq('user_id', req.user.id);

    if (error) {
      logger.error('DB error on file stats', { requestId: req.id, error: error.message });
      return res.status(500).json({ error: 'Failed to fetch stats' });
    }

    const files        = data || [];
    const totalFiles   = count ?? files.length;
    const storageBytes = files.reduce((sum, f) => sum + (f.file_size || 0), 0);

    return res.status(200).json({
      data: { totalFiles, storageBytes }
    });
  } catch (err) {
    logger.error('Stats error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET / (list files) ─────────────────────────────────────────────
const PAGE_SIZE = 20;

router.get('/', authenticateToken, async (req, res) => {
  try {
    // Fix 9: pagination — ?page=0,1,2,…
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('id, filename, file_size, mime_type, sha256_hash, uploaded_at')
      .eq('user_id', req.user.id)
      .order('uploaded_at', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('DB error listing files', { requestId: req.id, error: error.message });
      return res.status(500).json({ error: 'Failed to fetch files' });
    }

    const fetchedFiles = files || [];
    return res.status(200).json({
      data: {
        files: fetchedFiles,
        hasMore: fetchedFiles.length === PAGE_SIZE,
        page
      }
    });
  } catch (err) {
    logger.error('List files error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/download ─────────────────────────────────────────────
router.get('/:id/download', authenticateToken, validate(fileIdParams), async (req, res) => {
  const start = Date.now(); // Fix 6: latency tracking
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
      // ─── Large file: buffer-mode decryption with integrity check ──
      // Fix 1: Previously this streamed directly to res without verifying the
      // SHA-256 hash, allowing tampered files to be served silently.
      // We now buffer ALL decrypted output, verify hash, then send atomically.
      const decryptedChunks = [];

      const ivExtractor = new IVExtractorStream((iv) => {
        const decipher = createDecipher(iv);

        decipher.on('data', (chunk) => decryptedChunks.push(chunk));

        decipher.on('end', () => {
          const plaintext = Buffer.concat(decryptedChunks);
          const hash = sha256(plaintext);

          if (hash !== file.sha256_hash) {
            logger.error('Integrity check failed (large file)', {
              requestId: req.id, fileId: file.id, expected: file.sha256_hash, got: hash
            });
            if (!res.headersSent) {
              res.status(409).json({ error: 'File integrity check failed. File may have been tampered with.' });
            }
            return;
          }

          asyncLog('file_download', {
            userId: req.user.id,
            fileName: file.filename,
            fileSizeBytes: file.file_size,
            ipAddress: req.ip,
            durationMs: Date.now() - start, // Fix 6
          });

          res.write(plaintext);
          res.end();
        });

        decipher.on('error', (decErr) => {
          logger.error('Decryption stream error', { requestId: req.id, error: decErr.message });
          if (!res.headersSent) {
            res.status(500).json({ error: 'Decryption failed' });
          }
        });

        ivExtractor.pipe(decipher);
      });

      body.pipe(ivExtractor);

      body.on('error', (streamErr) => {
        logger.error('S3 stream error', { requestId: req.id, error: streamErr.message });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      });

      return; // Response handled by decipher 'end' event
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

    asyncLog('file_download', {
      userId: req.user.id,
      fileName: file.filename,
      fileSizeBytes: file.file_size,
      ipAddress: req.ip,
      durationMs: Date.now() - start, // Fix 6
    });

    return res.send(plaintext);
  } catch (err) {
    logger.error('Download error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validate(fileIdParams), async (req, res) => {
  const start = Date.now(); // Fix 6: latency tracking
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

    asyncLog('file_delete', {
      userId: req.user.id,
      fileName: file.filename,
      fileSizeBytes: file.file_size,
      ipAddress: req.ip,
      durationMs: Date.now() - start, // Fix 6
    });

    logger.info('File deleted', { requestId: req.id, fileId: file.id });
    return res.status(200).json({ data: { message: 'File deleted' } });
  } catch (err) {
    logger.error('Delete error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /bulk ────────────────────────────────────────────────────────────
router.delete('/bulk', authenticateToken, async (req, res) => {
  try {
    const { fileIds } = req.body;
    if (!Array.isArray(fileIds) || fileIds.length === 0)
      return res.status(400).json({ error: 'fileIds must be a non-empty array' });
    if (fileIds.length > 50)
      return res.status(400).json({ error: 'Maximum 50 files per bulk delete' });

    const { data: files, error: fetchErr } = await supabaseAdmin
      .from('files')
      .select('id, s3_key, filename, file_size')
      .in('id', fileIds)
      .eq('user_id', req.user.id);

    if (fetchErr || !files?.length)
      return res.status(404).json({ error: 'No matching files found' });

    const deleted = [], failed = [];
    for (const file of files) {
      try {
        await deleteFromS3(file.s3_key);
        deleted.push(file.id);
      } catch { failed.push(file.id); }
    }

    if (deleted.length) {
      await supabaseAdmin.from('files').delete().in('id', deleted).eq('user_id', req.user.id);
    }

    logger.info('Bulk delete', { requestId: req.id, deleted: deleted.length, failed: failed.length });
    return res.status(200).json({ data: { deleted: deleted.length, failed: failed.length } });
  } catch (err) {
    logger.error('Bulk delete error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});
module.exports = router;
