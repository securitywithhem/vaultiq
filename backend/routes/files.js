/**
 * =============================================================
 * VaultIQ — File Routes
 * =============================================================
 * POST   /api/files/upload       — encrypt & upload file to S3
 * GET    /api/files               — list user's files
 * GET    /api/files/:id/download  — decrypt & download file
 * DELETE /api/files/:id           — delete file from S3 + DB
 *
 * All routes require JWT authentication.
 * Files are AES-256-CBC encrypted before S3 upload.
 * SHA-256 hash is computed on plaintext for integrity verification.
 * HDFS logging is fire-and-forget — never blocks file operations.
 * =============================================================
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const { sha256, encrypt, decrypt } = require('../utils/crypto');
const { uploadToS3, downloadFromS3, deleteFromS3 } = require('../utils/s3');
const getSupabase = require('../utils/supabase');
const { logToHDFS } = require('../utils/hdfsLogger');

const router = express.Router();

// Multer — memory storage only — NEVER write plaintext to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max
  },
});

// ---------------------------------------------------------------
// POST /api/files/upload
// ---------------------------------------------------------------
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    // Validate file exists
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, originalname, mimetype, size } = req.file;
    const userId = req.user.id;

    // 1. Compute SHA-256 hash of plaintext (BEFORE encryption)
    const hash = sha256(buffer);

    // 2. Encrypt the buffer
    const { encryptedBuffer, iv } = encrypt(buffer);

    // 3. Generate a unique S3 key
    const fileId = crypto.randomUUID();
    const s3Key = `uploads/${userId}/${fileId}/${originalname}`;

    // 4. Upload encrypted buffer to S3 with IV in metadata
    await uploadToS3(s3Key, encryptedBuffer, mimetype, iv);

    // 5. Insert file record into Supabase
    const supabase = getSupabase();
    const { data: fileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        id: fileId,
        user_id: userId,
        filename: originalname,
        s3_key: s3Key,
        file_size: size,
        sha256_hash: hash,
        mime_type: mimetype || 'application/octet-stream',
      })
      .select('id, filename, file_size, uploaded_at, sha256_hash')
      .single();

    if (dbError) {
      // TODO: remove in prod
      console.error('[Files] DB insert error:', dbError);
      return res.status(500).json({ error: 'Upload failed', details: dbError.message });
    }

    // 6. Log to HDFS (fire-and-forget — never await, never let it break the response)
    logToHDFS('UPLOAD', {
      user_id: userId,
      file_id: fileId,
      filename: originalname,
      file_size: size,
      sha256_hash: hash,
    }).catch(console.error);

    return res.status(201).json({ file: fileRecord });
  } catch (err) {
    // TODO: remove in prod
    console.error('[Files] Upload crash:', err);
    return res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ---------------------------------------------------------------
// GET /api/files
// ---------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabase = getSupabase();

    const { data: files, error } = await supabase
      .from('files')
      .select('id, filename, file_size, mime_type, uploaded_at, sha256_hash')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      // TODO: remove in prod
      console.error('[Files] List error:', error);
      return res.status(500).json({ error: 'Failed to fetch files' });
    }

    return res.status(200).json({ files: files || [] });
  } catch (err) {
    // TODO: remove in prod
    console.error('[Files] List crash:', err);
    return res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// ---------------------------------------------------------------
// GET /api/files/:id/download
// ---------------------------------------------------------------
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const supabase = getSupabase();

    // 1. Fetch file record from Supabase
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fetchError || !file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 2. Verify ownership
    if (file.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // 3. Download encrypted buffer + IV from S3
    const { buffer: encryptedBuffer, iv } = await downloadFromS3(file.s3_key);

    if (!iv) {
      return res.status(500).json({ error: 'Missing encryption metadata — cannot decrypt' });
    }

    // 4. Decrypt the buffer
    const decryptedBuffer = decrypt(encryptedBuffer, iv);

    // 5. Integrity check — re-compute SHA-256 and compare
    const downloadHash = sha256(decryptedBuffer);
    if (downloadHash !== file.sha256_hash) {
      // TODO: remove in prod
      console.error(`[Files] Integrity mismatch for file ${fileId}: stored=${file.sha256_hash}, computed=${downloadHash}`);
      return res.status(409).json({
        error: 'Integrity check failed — file may be corrupted or tampered',
      });
    }

    // 6. Log download event to HDFS (fire-and-forget)
    logToHDFS('DOWNLOAD', {
      user_id: userId,
      file_id: fileId,
      filename: file.filename,
      file_size: file.file_size,
    }).catch(console.error);

    // 7. Send the decrypted file
    res.set({
      'Content-Type': file.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
      'Content-Length': decryptedBuffer.length,
    });

    return res.send(decryptedBuffer);
  } catch (err) {
    // TODO: remove in prod
    console.error('[Files] Download crash:', err);
    return res.status(500).json({ error: 'Download failed', details: err.message });
  }
});

// ---------------------------------------------------------------
// DELETE /api/files/:id
// ---------------------------------------------------------------
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const supabase = getSupabase();

    // 1. Fetch file record
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fetchError || !file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 2. Verify ownership
    if (file.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // 3. Delete from S3
    await deleteFromS3(file.s3_key);

    // 4. Delete record from Supabase
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      // TODO: remove in prod
      console.error('[Files] DB delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete file record' });
    }

    // 5. Log delete event to HDFS (fire-and-forget)
    logToHDFS('DELETE', {
      user_id: userId,
      file_id: fileId,
      filename: file.filename,
    }).catch(console.error);

    return res.status(200).json({ message: 'File deleted' });
  } catch (err) {
    // TODO: remove in prod
    console.error('[Files] Delete crash:', err);
    return res.status(500).json({ error: 'Delete failed', details: err.message });
  }
});

module.exports = router;
