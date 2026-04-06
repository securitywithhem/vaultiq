/**
 * @file analytics.js
 * @description Serves analytics metrics from HDFS, triggers log processing
 * @dependencies express, node-fetch, child_process, auth middleware, logger
 * @exports router
 */

const express = require('express');
const fetch = require('node-fetch');
const { execFile } = require('child_process');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const DEFAULT_STATS = {
  totalFiles: 0,
  totalStorage: 0,
  eventDistribution: {},
  userActivity: {},
  fileTypeDistribution: [],
  recentUploads: []
};

// ─── GET / (fetch analytics) ────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const baseUrl = process.env.HDFS_WEBHDFS_URL;
    const url = `${baseUrl}/vaultiq/results/analytics.json?op=OPEN`;

    let stats = null;

    try {
      const hdfsRes = await fetch(url, { timeout: 5000 });

      if (hdfsRes.status === 307 || hdfsRes.status === 200) {
        const readUrl = hdfsRes.status === 307 ? hdfsRes.headers.get('location') : url;

        if (readUrl) {
          const dataRes = await fetch(readUrl, { timeout: 5000 });
          if (dataRes.ok) {
            stats = await dataRes.json();
          }
        }
      }
    } catch (hdfsErr) {
      logger.warn('HDFS analytics fetch failed — returning defaults', {
        requestId: req.id, error: hdfsErr.message
      });
    }

    return res.status(200).json({ data: stats || DEFAULT_STATS });
  } catch (err) {
    logger.error('Analytics fetch error', { requestId: req.id, error: err.message });
    return res.status(200).json({ data: DEFAULT_STATS });
  }
});

// ─── POST /refresh (trigger log processing) ────────────────────────
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const scriptPath = path.resolve(__dirname, '../scripts/process_logs.py');

    logger.info('Triggering analytics log processing', { requestId: req.id });

    // execFile is safe from shell injection (no shell interpolation)
    execFile('python3', [scriptPath], {
      env: { ...process.env, PYTHONPATH: process.env.PYTHONPATH || '.' },
      timeout: 120000 // 2 minute timeout
    }, (error, stdout, stderr) => {
      if (error) {
        logger.error('Analytics processing failed', { error: stderr || error.message });
        return;
      }
      logger.info('Analytics processing complete', { output: stdout.trim() });
    });

    return res.status(202).json({ data: { message: 'Analytics aggregation started in background' } });
  } catch (err) {
    logger.error('Analytics refresh error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
