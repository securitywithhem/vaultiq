/**
 * @file analytics.js
 * @description Reads 7 Spark analytics result folders from HDFS via WebHDFS,
 *              with automatic per-analytic fallback to analytics_cache/ JSON files.
 *
 * WebHDFS two-step read pattern:
 *   1. GET /folder?op=LISTSTATUS  → list files, find the "part-" file
 *   2. GET /file?op=OPEN          → axios follows the 307 DataNode redirect automatically
 *   3. Split text by '\n'         → parse each non-empty line as JSON
 *
 * Response shape:
 *   { daily_trend, top_files, user_storage, event_breakdown,
 *     hourly_pattern, platform_totals, anomalies, _source }
 */

const express    = require('express');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');
const { execFile } = require('child_process');
const { authenticateToken } = require('../middleware/auth');
const logger     = require('../utils/logger');

const router = express.Router();

// ─── Configuration ────────────────────────────────────────────────────────────
// HDFS_WEBHDFS_URL already includes /webhdfs/v1  (e.g. http://namenode:9870/webhdfs/v1)
const HDFS_BASE = process.env.HDFS_WEBHDFS_URL || 'http://localhost:9870/webhdfs/v1';
const HDFS_USER = process.env.HDFS_USER        || 'root';
const CACHE_DIR = path.resolve(__dirname, '../analytics_cache');
const RESULTS   = '/vaultiq/results';

const ANALYTICS = [
  'daily_trend',
  'top_files',
  'user_storage',
  'event_breakdown',
  'hourly_pattern',
  'platform_totals',
  'anomalies',
];

// ─── WebHDFS reader ───────────────────────────────────────────────────────────

/**
 * Read one Spark results folder from HDFS and return its rows as an array.
 *
 * Throws on any HDFS / network error so the caller can fall through to cache.
 *
 * @param {string} name  e.g. "daily_trend"
 * @returns {Promise<Object[]>}
 */
async function readHDFSFolder(name) {
  const folderPath = `${RESULTS}/${name}`;
  const user       = encodeURIComponent(HDFS_USER);

  // Step 1: LISTSTATUS — list the folder contents
  const listUrl = `${HDFS_BASE}${folderPath}?op=LISTSTATUS&user.name=${user}`;
  const listRes = await axios.get(listUrl, { timeout: 8_000 });

  const files    = listRes.data?.FileStatuses?.FileStatus || [];
  const partFile = files.find(f => String(f.pathSuffix).startsWith('part-'));

  if (!partFile) {
    logger.warn(`[analytics] No part- file in HDFS folder ${folderPath}`);
    return [];
  }

  // Step 2: OPEN — axios follows the 307 DataNode redirect automatically
  const openUrl = `${HDFS_BASE}${folderPath}/${partFile.pathSuffix}?op=OPEN&user.name=${user}`;
  const fileRes = await axios.get(openUrl, {
    timeout:      10_000,
    maxRedirects: 5,
    responseType: 'text',   // raw text, NOT parsed JSON (content is newline-delimited)
  });

  // Step 3: parse newline-delimited JSON
  return fileRes.data
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));
}

// ─── Local cache reader ───────────────────────────────────────────────────────

/**
 * Read one analytic from analytics_cache/{name}.json (written by process_logs.py).
 * Returns null if the file is missing or unparseable — caller uses [] instead.
 *
 * @param {string} name
 * @returns {Object[]|null}
 */
function readCache(name) {
  try {
    const raw = fs.readFileSync(path.join(CACHE_DIR, `${name}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', authenticateToken, async (req, res) => {
  const raw    = {};
  let   hdfsUp = false;

  // Fetch all 7 folders in parallel.
  // Each task writes into `raw` on success, leaves null on failure.
  // We never let one failure abort the others (Promise.all + individual catch).
  const tasks = ANALYTICS.map(name =>
    readHDFSFolder(name)
      .then(data => {
        raw[name] = data;
        hdfsUp    = true;           // at least one folder was reachable
      })
      .catch(err => {
        raw[name] = null;           // will be replaced by cache below
        logger.warn(`[analytics] HDFS read failed for "${name}": ${err.message}`);
      })
  );

  await Promise.all(tasks);

  // For every folder that failed, try the local cache as fallback
  for (const name of ANALYTICS) {
    if (raw[name] === null) {
      const cached = readCache(name);
      if (cached) {
        logger.info(`[analytics] Using cache fallback for "${name}"`);
      }
      raw[name] = cached || [];
    }
  }

  // platform_totals is written by Spark as a single-element array (.coalesce(1)).
  // Unwrap it here so the frontend receives a plain object, not a one-item array.
  const ptArr = raw.platform_totals;
  const platform_totals = Array.isArray(ptArr) && ptArr.length > 0
    ? ptArr[0]
    : { total_events: 0, active_users: 0, total_bytes_uploaded: 0 };

  return res.status(200).json({
    daily_trend:     raw.daily_trend     || [],
    top_files:       raw.top_files       || [],
    user_storage:    raw.user_storage    || [],
    event_breakdown: raw.event_breakdown || [],
    hourly_pattern:  raw.hourly_pattern  || [],
    platform_totals,
    anomalies:       raw.anomalies       || [],
    // Internal field: lets the frontend show which data source is active
    _source: hdfsUp ? 'hdfs' : 'cache',
  });
});

// ─── POST /refresh ────────────────────────────────────────────────────────────
// Triggers the Python MapReduce fallback (process_logs.py) in the background.
// For the full Spark job, run: docker exec spark-master spark-submit ...

router.post('/refresh', authenticateToken, async (req, res) => {
  const scriptPath = path.resolve(__dirname, '../scripts/process_logs.py');

  try {
    // execFile is safe from shell injection — arguments are never interpolated
    execFile('python3', [scriptPath], {
      env:     { ...process.env },
      timeout: 120_000,
    }, (err, stdout, stderr) => {
      if (err) {
        logger.error('[analytics] process_logs.py failed', {
          error: (stderr || err.message).slice(0, 300),
        });
        return;
      }
      logger.info('[analytics] process_logs.py complete', { output: stdout.trim().slice(0, 200) });
    });

    return res.status(202).json({ data: { message: 'Analytics refresh started in background' } });
  } catch (err) {
    logger.error('[analytics] refresh route error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
