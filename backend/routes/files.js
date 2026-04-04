/**
 * @file files.js
 * @description File upload, retrieval, and deletion routes
 * @dependencies express, multer, crypto, s3, supabase, hdfsLogger, auth middleware
 * @exports router
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const { encrypt, decrypt, sha256, createDecipher } = require('../utils/crypto');
const { uploadToS3, downloadFromS3, deleteFromS3 } = require('../utils/s3');
const { supabaseAdmin } = require('../utils/supabase');
const { logEvent } = require('../utils/hdfsLogger');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// File upload validation constants
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.macro-enabled.document',
  'text/plain',
  'text/markdown'
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.docm', '.txt', '.md'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Sanitize filename - remove path traversal attempts and unsafe characters
function sanitizeFilename(filename) {
  // Remove directory path separators
  let sanitized = path.basename(filename);
  // Replace unsafe characters with underscore
  sanitized = sanitized.replace(/[^a-zA-Z0-9._\-]/g, '_');
  // Limit length
  return sanitized.slice(0, 255);
}

// Upload a new file
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    // 1. Validate file exists
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!req.file.buffer) return res.status(400).json({ error: 'No valid file uploaded' });

    // 2. Validate file size
    if (req.file.size > MAX_FILE_SIZE) {
      return res.status(413).json({ error: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024*1024)}MB` });
    }

    // 3. Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Unsupported file type. Allowed: PDF, DOCX, TXT, Markdown' });
    }

    // 4. Validate file extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file extension' });
    }

    // 5. Sanitize filename (prevents path traversal)
    const sanitizedFilename = sanitizeFilename(req.file.originalname);
    
    // 6. Generate secure S3 key with UUID
    const uniqueId = crypto.randomUUID();
    const s3Key = `${req.user.id}/${Date.now()}_${uniqueId}_${sanitizedFilename}.enc`;

    // 7. Calculate SHA-256 hash before encryption
    const sha256_hash = sha256(req.file.buffer);

    // 8. Encrypt file
    const { data: encrypted, iv } = encrypt(req.file.buffer);
    
    // 9. Prepend IV to encrypted data (standard practice - IV doesn't need to be secret)
    const finalData = Buffer.concat([iv, encrypted]);

    // 10. Upload to S3 (without exposing IV in metadata)
    await uploadToS3(s3Key, finalData, req.file.mimetype);

    // 11. Store metadata in Supabase
    const { data: fileRecord, error: dbError } = await supabaseAdmin
      .from('files')
      .insert({
        user_id: req.user.id,
        filename: sanitizedFilename,
        s3_key: s3Key,
        file_size: req.file.size,
        mime_type: req.file.mimetype || 'application/octet-stream',
        sha256_hash: sha256_hash
      })
      .select('id, filename, file_size, uploaded_at, sha256_hash')
      .single();

    if (dbError) {
      return res.status(500).json({ error: 'Database error storing file record' });
    }

    (async () => {
      try {
        await logEvent({
          event: 'upload',
          user_id: req.user.id,
          filename: req.file.originalname,
          file_size: req.file.size,
          s3_key: s3Key
        });
      } catch (logErr) {
        console.error('[files.upload.logger]', logErr.message);
      }
    })();

    return res.status(201).json({ data: { file: fileRecord } });
  } catch (err) {
    console.error('[files.upload]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Retrieve user's file list
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('id, filename, file_size, mime_type, sha256_hash, uploaded_at')
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch files' });
    }

    return res.status(200).json({ data: { files: files || [] } });
  } catch (err) {
    console.error('[files.list]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Download user's file
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const { data: file, error: fetchError } = await supabaseAdmin
      .from('files')
      .select('id, user_id, filename, file_size, mime_type, sha256_hash, s3_key')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { body, metadata, isStream } = await downloadFromS3(file.s3_key);

    if (!metadata || !metadata.iv) {
      return res.status(500).json({ error: 'Missing encryption metadata' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');

    if (isStream) {
      const decipher = createDecipher(metadata.iv);
      body.pipe(decipher).pipe(res);

      try {
        await logEvent({
          event: 'download',
          user_id: req.user.id,
          filename: file.filename,
          file_size: file.file_size,
          s3_key: file.s3_key
        });
      } catch (logErr) {
        console.error('[files.download.logger]', logErr.message);
      }
      return;
    }

    const plaintext = decrypt(body, metadata.iv);

    const hash = sha256(plaintext);
    if (hash !== file.sha256_hash) {
      return res.status(409).json({ error: 'Integrity check failed' });
    }

    (async () => {
      try {
        await logEvent({
          event: 'download',
          user_id: req.user.id,
          filename: file.filename,
          file_size: file.file_size,
          s3_key: file.s3_key
        });
      } catch (logErr) {
        console.error('[files.download.logger]', logErr.message);
      }
    })();

    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    return res.send(plaintext);
  } catch (err) {
    console.error('[files.download]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user's file
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { data: file, error: fetchError } = await supabaseAdmin
      .from('files')
      .select('id, user_id, filename, s3_key')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await deleteFromS3(file.s3_key);

    const { error: deleteError } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('id', req.params.id);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete file records' });
    }

    (async () => {
      try {
        await logEvent({
          event: 'delete',
          user_id: req.user.id,
          filename: file.filename,
          s3_key: file.s3_key
        });
      } catch (logErr) {
        console.error('[files.delete.logger]', logErr.message);
      }
    })();

    return res.status(200).json({ message: 'File deleted' });
  } catch (err) {
    console.error('[files.delete]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
