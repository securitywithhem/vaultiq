/**
 * @file files.js
 * @description File upload, retrieval, and deletion routes
 * @dependencies express, multer, crypto, s3, supabase, hdfsLogger, auth middleware
 * @exports router
 */

const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { encrypt, decrypt, sha256, createDecipher } = require('../utils/crypto');
const { uploadToS3, downloadFromS3, deleteFromS3 } = require('../utils/s3');
const { supabaseAdmin } = require('../utils/supabase');
const { logEvent } = require('../utils/hdfsLogger');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload a new file
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!req.file.buffer) return res.status(400).json({ error: 'No valid file uploaded' });

    const sha256_hash = sha256(req.file.buffer);
    const { data: encrypted, iv } = encrypt(req.file.buffer);

    const s3Key = `${req.user.id}/${Date.now()}_${req.file.originalname}.enc`;
    
    await uploadToS3(s3Key, encrypted, req.file.mimetype, iv.toString('hex'));

    const { data: fileRecord, error: dbError } = await supabaseAdmin
      .from('files')
      .insert({
        user_id: req.user.id,
        filename: req.file.originalname,
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
