/**
 * @file analytics.js
 * @description Analytics API — 3-tier reading strategy:
 *   1. HDFS  (analytics_latest.json via WebHDFS OPEN)
 *   2. Local bigdata/results/analytics_latest.json
 *   3. Supabase event_logs (basic live counts)
 *
 * GET  /api/analytics         — returns full analytics payload
 * POST /api/analytics/trigger — spawns bigdata/run_analytics.sh in background
 */

const express    = require('express');
const axios      = require('axios');
const fs         = require('fs');
const path       = require('path');
const { spawn }  = require('child_process');
const { authenticateToken } = require('../middleware/auth');
const logger     = require('../utils/logger');

const router = express.Router();

// ─── Configuration ────────────────────────────────────────────────────────────

const HDFS_BASE  = process.env.HDFS_WEBHDFS_URL || 'http://localhost:9870/webhdfs/v1';
const HDFS_USER  = process.env.HDFS_USER        || 'root';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Paths relative to this file: backend/routes/analytics.js
// ../../bigdata/results  →  <project_root>/bigdata/results
const LOCAL_RESULTS_FILE = path.resolve(__dirname, '../../bigdata/results/analytics_latest.json');
const SCRIPT_PATH        = path.resolve(__dirname, '../../bigdata/run_analytics.sh');

// ─── Tier 1 — HDFS ───────────────────────────────────────────────────────────

async function readFromHDFS() {
  const hdfsPath = '/vaultiq/results/analytics_latest.json';
  const user     = encodeURIComponent(HDFS_USER);
  const openUrl  = `${HDFS_BASE}${hdfsPath}?op=OPEN&user.name=${user}`;

  const res = await axios.get(openUrl, {
    timeout:      10_000,
    maxRedirects: 5,
    responseType: 'text',
  });

  return JSON.parse(res.data);
}

// ─── Tier 2 — Local file ──────────────────────────────────────────────────────

function readFromLocal() {
  const raw = fs.readFileSync(LOCAL_RESULTS_FILE, 'utf8');
  return JSON.parse(raw);
}

// ─── Tier 3 — Supabase live counts ───────────────────────────────────────────

async function readFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase env vars not configured');
  }

  const res = await axios.get(`${SUPABASE_URL}/rest/v1/event_logs`, {
    params:  { select: 'event_type', limit: 50000 },
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    timeout: 15_000,
  });

  // Group-count in JS
  const counts = {};
  for (const row of res.data) {
    const et = row.event_type || 'unknown';
    counts[et] = (counts[et] || 0) + 1;
  }

  return {
    generated_at:    new Date().toISOString(),
    daily_activity:  { dates: [], uploads: [], downloads: [], detections: [], total_bytes_per_day: [] },
    anomaly_detection: { delete_spikes: [], suspicious_users: [] },
    ai_usage_stats:  { verdict_counts: {}, avg_score_by_type: {}, top_file_types: [] },
    storage_analytics: { top_uploaders: [], file_type_distribution: [] },
    latency_analysis:  { avg_latency_by_type: {}, p95_latency: {}, busiest_hours: [] },
    user_behaviour:    { daily_active_users: [], returning_users_count: 0, common_sequences: [] },
    _live_counts: counts,
  };
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', authenticateToken, async (req, res) => {
  res.set('Cache-Control', 'max-age=300');

  // Tier 1 — HDFS
  if (HDFS_BASE) {
    try {
      const data = await readFromHDFS();
      logger.info('[analytics] Served from HDFS', { requestId: req.id });
      return res.status(200).json({ source: 'hdfs', ...data });
    } catch (err) {
      logger.warn('[analytics] HDFS read failed, trying local cache', {
        requestId: req.id,
        error:     err.message,
      });
    }
  }

  // Tier 2 — local file
  try {
    const data = readFromLocal();
    logger.info('[analytics] Served from local cache', { requestId: req.id });
    return res.status(200).json({ source: 'local_cache', ...data });
  } catch (err) {
    logger.warn('[analytics] Local cache read failed, trying Supabase', {
      requestId: req.id,
      error:     err.message,
    });
  }

  // Tier 3 — Supabase
  try {
    const data = await readFromSupabase();
    logger.info('[analytics] Served from Supabase live counts', { requestId: req.id });
    return res.status(200).json({ source: 'supabase_live', ...data });
  } catch (err) {
    logger.error('[analytics] All 3 tiers failed', {
      requestId: req.id,
      error:     err.message,
    });
  }

  return res.status(503).json({
    error: 'Analytics service unavailable. Run the analytics job or check your HDFS connection.',
  });
});

// ─── POST /trigger ────────────────────────────────────────────────────────────

router.post('/trigger', authenticateToken, (req, res) => {
  logger.info('[analytics] Triggering analytics job', { requestId: req.id });

  // spawn is safe from shell injection — arguments are never interpolated
  const child = spawn('bash', [SCRIPT_PATH], {
    env:      { ...process.env },
    detached: true,
    stdio:    ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', d =>
    logger.info('[analytics/trigger] stdout: ' + d.toString().trim())
  );
  child.stderr.on('data', d =>
    logger.warn('[analytics/trigger] stderr: ' + d.toString().trim())
  );

  child.on('error', err =>
    logger.error('[analytics/trigger] spawn error', { error: err.message })
  );

  // Unref so the process can outlive the request
  child.unref();

  return res.status(202).json({
    status:  'triggered',
    message: 'Analytics job started in background. Results will be available shortly.',
  });
});

module.exports = router;
