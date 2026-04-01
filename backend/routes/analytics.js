/**
 * @file analytics.js
 * @description Serves analytics metrics from HDFS
 * @dependencies express, node-fetch, auth middleware
 * @exports router
 */

const express = require('express');
const fetch = require('node-fetch');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Fetch storage metrics 
router.get('/', authenticateToken, async (req, res) => {
  const defaultStats = { topFiles: [], storagePerUser: [], dailyTrend: [], anomalies: [] };

  try {
    const baseUrl = process.env.HDFS_WEBHDFS_URL;
    const url = `${baseUrl}/vaultiq/results/analytics.json?op=OPEN`;
    
    let stats = null;
    const hdfsRes = await fetch(url, { timeout: 3000 });
    
    if (hdfsRes.status === 307 || hdfsRes.status === 200) {
      const readUrl = hdfsRes.status === 307 ? hdfsRes.headers.get('location') : url;
      
      if (readUrl) {
        const dataRes = await fetch(readUrl, { timeout: 3000 });
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

module.exports = router;
