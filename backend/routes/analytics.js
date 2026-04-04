/**
 * @file analytics.js
 * @description Serves analytics metrics from HDFS
 * @dependencies express, node-fetch, auth middleware
 * @exports router
 */

const express = require('express');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Fetch storage metrics 
router.get('/', authenticateToken, async (req, res) => {
  const defaultStats = { 
    totalFiles: 0, 
    totalStorage: 0, 
    eventDistribution: {}, 
    userActivity: {}, 
    fileTypeDistribution: [], 
    recentUploads: [] 
  };

  try {
    const baseUrl = process.env.HDFS_WEBHDFS_URL;
    const url = `${baseUrl}/vaultiq/results/analytics.json?op=OPEN`;
    
    let stats = null;
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

    return res.status(200).json({ data: stats || defaultStats });
  } catch (err) {
    console.error('[analytics.get]', err.message);
    return res.status(200).json({ data: defaultStats });
  }
});

/**
 * @route POST /api/analytics/refresh
 * @description Triggers the Python Log Processor (MapReduce style)
 * @access Private
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const scriptPath = path.join(__dirname, '../scripts/process_logs.py');
    const env = { 
      ...process.env, 
      PYTHONPATH: process.env.PYTHONPATH || '.' 
    };

    console.log('[analytics.refresh] Triggering log processing...');

    // Run as background process, but return acceptance quickly
    exec(`python3 ${scriptPath}`, { env }, (error, stdout, stderr) => {
      if (error) {
        console.error('[analytics.refresh] Processing Error:', stderr);
        return;
      }
      console.log('[analytics.refresh] Processing Success:', stdout);
    });

    return res.status(202).json({ message: 'Analytics aggregation started in background' });
  } catch (err) {
    console.error('[analytics.refresh]', err.message);
    return res.status(500).json({ error: 'Internal Error' });
  }
});

module.exports = router;
