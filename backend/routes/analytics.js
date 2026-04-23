/**
 * @file analytics.js
 * @description Analytics API — 3-tier reading strategy:
 *   1. HDFS  (analytics_latest.json via WebHDFS OPEN)
 *   2. Local bigdata/results/analytics_latest.json
 *   3. Supabase live — derives real analytics from files + event_logs tables
 *
 * GET  /api/analytics         — returns full analytics payload
 * POST /api/analytics/trigger — spawns bigdata/run_analytics.sh in background
 */

const express   = require('express');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');
const { authenticateToken } = require('../middleware/auth');
const { supabaseAdmin }     = require('../utils/supabase');
const logger    = require('../utils/logger');

const router = express.Router();

// ─── Configuration ────────────────────────────────────────────────────────────

const HDFS_BASE  = process.env.HDFS_WEBHDFS_URL || '';
const HDFS_USER  = process.env.HDFS_USER        || 'root';

const LOCAL_RESULTS_FILE  = path.resolve(__dirname, '../../bigdata/results/analytics_latest.json');
const SCRIPT_PATH         = path.resolve(__dirname, '../../bigdata/run_analytics.sh');
const AI_DETECTIONS_FILE  = path.resolve(__dirname, '../../backend/data/ai_detections.json');

function readLocalAIDetections() {
  try {
    const raw = fs.readFileSync(AI_DETECTIONS_FILE, 'utf8');
    return JSON.parse(raw).detections || [];
  } catch { return []; }
}

// ─── Tier 1 — HDFS ───────────────────────────────────────────────────────────

async function readFromHDFS() {
  if (!HDFS_BASE) throw new Error('HDFS not configured');
  const hdfsPath = '/vaultiq/results/analytics_latest.json';
  const user     = encodeURIComponent(HDFS_USER);
  const openUrl  = `${HDFS_BASE}${hdfsPath}?op=OPEN&user.name=${user}`;

  const res = await axios.get(openUrl, {
    timeout:      10_000,
    maxRedirects: 5,
    responseType: 'text',
  });

  try {
    return JSON.parse(res.data);
  } catch (parseErr) {
    throw new Error(`HDFS response is not valid JSON: ${parseErr.message}`);
  }
}

// ─── Tier 2 — Local file ──────────────────────────────────────────────────────

function readFromLocal() {
  const raw = fs.readFileSync(LOCAL_RESULTS_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (parseErr) {
    throw new Error(`Local analytics file is not valid JSON: ${parseErr.message}`);
  }
}

// ─── Tier 3 — Supabase live analytics ────────────────────────────────────────
// Derives real analytics from the files table + event_logs table.

async function readFromSupabase() {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);

  // ── Pull files data ──────────────────────────────────────────────────────
  const { data: allFilesRaw } = await supabaseAdmin
    .from('files')
    .select('id, filename, file_size, mime_type, uploaded_at, user_id')
    .order('uploaded_at', { ascending: true });
  const allFiles = allFilesRaw || [];

  // ── Pull event_logs data (last 14 days) ──────────────────────────────────
  const since14 = new Date(now);
  since14.setDate(since14.getDate() - 14);

  let events = [];
  try {
    const { data: eventsRaw } = await supabaseAdmin
      .from('event_logs')
      .select('event_type, file_size_bytes, file_type, ai_verdict, ai_score, duration_ms, timestamp, user_id')
      .gte('timestamp', since14.toISOString())
      .order('timestamp', { ascending: true });
    events = eventsRaw || [];
  } catch (_) {
    // event_logs table may not exist — continue with files-only analytics
  }

  // ── Daily activity over last 14 days ─────────────────────────────────────
  const dateRange = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dateRange.push(d.toISOString().slice(0, 10));
  }

  // Bucket events by date
  const byDate = {};
  for (const d of dateRange) {
    byDate[d] = { uploads: 0, downloads: 0, detections: 0, bytes: 0 };
  }

  for (const ev of events) {
    const d = ev.timestamp?.slice(0, 10);
    if (!byDate[d]) continue;
    if (ev.event_type === 'file_upload')   { byDate[d].uploads++;    byDate[d].bytes += ev.file_size_bytes || 0; }
    if (ev.event_type === 'file_download') byDate[d].downloads++;
    if (ev.event_type === 'ai_detection')  byDate[d].detections++;
  }

  // Also count uploads from the files table (fallback when event_logs is empty)
  if (events.length === 0 && allFiles.length > 0) {
    for (const f of allFiles) {
      const d = f.uploaded_at?.slice(0, 10);
      if (byDate[d]) { byDate[d].uploads++; byDate[d].bytes += f.file_size || 0; }
    }
  }

  const dates      = dateRange;
  const uploads    = dateRange.map(d => byDate[d].uploads);
  const downloads  = dateRange.map(d => byDate[d].downloads);
  const detections = dateRange.map(d => byDate[d].detections);
  const bytesDay   = dateRange.map(d => byDate[d].bytes);

  // ── Storage by file type ─────────────────────────────────────────────────
  const typeMap = {};
  for (const f of allFiles) {
    const t = f.mime_type || 'unknown';
    typeMap[t] = (typeMap[t] || 0) + (f.file_size || 0);
  }
  const file_type_distribution = Object.entries(typeMap)
    .map(([file_type, total_bytes]) => ({ file_type, total_bytes }))
    .sort((a, b) => b.total_bytes - a.total_bytes);

  // ── AI verdict distribution — from event_logs + local store ────────────────
  const verdictMap = {};
  for (const ev of events) {
    if (ev.event_type === 'ai_detection' && ev.ai_verdict) {
      const label = ev.ai_verdict === 'ai_generated' ? 'AI-Generated'
                  : ev.ai_verdict === 'mixed'         ? 'Mixed'
                  :                                     'Human';
      verdictMap[label] = (verdictMap[label] || 0) + 1;
    }
  }
  // Supplement with locally-stored AI detection results
  const localDetections = readLocalAIDetections();
  for (const det of localDetections) {
    if (!det.verdict) continue;
    const label = det.verdict === 'ai_generated' ? 'AI-Generated'
                : det.verdict === 'mixed'         ? 'Mixed'
                :                                   'Human';
    verdictMap[label] = (verdictMap[label] || 0) + 1;
  }
  // Also feed local detections into daily activity
  for (const det of localDetections) {
    const d = det.timestamp?.slice(0, 10);
    if (byDate[d]) byDate[d].detections++;
  }

  // ── Latency analysis ─────────────────────────────────────────────────────
  const latencyBuckets = {};
  for (const ev of events) {
    if (!ev.duration_ms || !ev.event_type) continue;
    if (!latencyBuckets[ev.event_type]) latencyBuckets[ev.event_type] = [];
    latencyBuckets[ev.event_type].push(ev.duration_ms);
  }

  const avg_latency_by_type = {};
  const p95_latency         = {};
  for (const [et, vals] of Object.entries(latencyBuckets)) {
    vals.sort((a, b) => a - b);
    avg_latency_by_type[et] = vals.reduce((s, v) => s + v, 0) / vals.length;
    p95_latency[et]         = vals[Math.floor(vals.length * 0.95)] ?? vals[vals.length - 1];
  }

  // ── Anomaly detection — delete spikes ───────────────────────────────────
  const deleteByDate = {};
  for (const ev of events) {
    if (ev.event_type !== 'file_delete') continue;
    const d = ev.timestamp?.slice(0, 10);
    if (!d) continue;
    deleteByDate[d] = (deleteByDate[d] || 0) + 1;
  }
  const delete_spikes = Object.entries(deleteByDate)
    .filter(([, cnt]) => cnt > 5)
    .map(([date, delete_count]) => ({ date, delete_count }));

  // ── Suspicious users (> 50 events in an hour) ───────────────────────────
  const userHourMap = {};
  for (const ev of events) {
    if (!ev.user_id || !ev.timestamp) continue;
    const hour = ev.timestamp.slice(0, 13); // YYYY-MM-DDTHH
    const key  = `${ev.user_id}|${hour}`;
    userHourMap[key] = (userHourMap[key] || 0) + 1;
  }
  const suspicious_users = Object.entries(userHourMap)
    .filter(([, cnt]) => cnt > 50)
    .map(([key, event_count]) => {
      const [user_id, hour] = key.split('|');
      return { user_id, hour, event_count };
    });

  // ── Today's counts ───────────────────────────────────────────────────────
  const todayIdx       = dateRange.indexOf(today);
  const todayUploads   = todayIdx >= 0 ? uploads[todayIdx]    : 0;
  const todayDetections= todayIdx >= 0 ? detections[todayIdx] : 0;
  const todayBytes     = todayIdx >= 0 ? bytesDay[todayIdx]   : 0;

  return {
    generated_at: now.toISOString(),
    daily_activity: {
      dates,
      uploads,
      downloads,
      detections,
      total_bytes_per_day: bytesDay,
    },
    anomaly_detection: {
      delete_spikes,
      suspicious_users,
    },
    ai_usage_stats: {
      verdict_counts:      verdictMap,
      avg_score_by_type:   {},
      top_file_types:      [],
    },
    storage_analytics: {
      top_uploaders:         [],
      file_type_distribution,
    },
    latency_analysis: {
      avg_latency_by_type,
      p95_latency,
      busiest_hours: [],
    },
    user_behaviour: {
      daily_active_users:    [],
      returning_users_count: 0,
      common_sequences:      [],
    },
    // Convenience summary for frontend metric cards
    _summary: {
      today_uploads:    todayUploads,
      today_detections: todayDetections,
      today_bytes:      todayBytes,
      total_files:      allFiles.length,
    },
  };
}

// ─── Empty fallback (all tiers failed) ───────────────────────────────────────

function emptyPayload() {
  return {
    generated_at: new Date().toISOString(),
    daily_activity:   { dates: [], uploads: [], downloads: [], detections: [], total_bytes_per_day: [] },
    anomaly_detection:{ delete_spikes: [], suspicious_users: [] },
    ai_usage_stats:   { verdict_counts: {}, avg_score_by_type: {}, top_file_types: [] },
    storage_analytics:{ top_uploaders: [], file_type_distribution: [] },
    latency_analysis: { avg_latency_by_type: {}, p95_latency: {}, busiest_hours: [] },
    user_behaviour:   { daily_active_users: [], returning_users_count: 0, common_sequences: [] },
  };
}

// ─── Normalize raw analytics into the shape Analytics.jsx expects ─────────────
// Both the Spark job and the Supabase live path emit the same internal shape:
//   daily_activity.{dates,uploads,downloads,detections,total_bytes_per_day}
//   latency_analysis.busiest_hours[{hour,event_count}]
//   anomaly_detection.suspicious_users[{user_id,hour,event_count}]
//   user_behaviour.daily_active_users[{date,active_users}]
//
// The frontend expects:
//   _source, platform_totals, daily_trend, top_files, event_breakdown,
//   hourly_pattern, anomalies

function normalizeForFrontend(raw, source) {
  const da        = raw.daily_activity || {};
  const dates     = da.dates              || [];
  const uploads   = da.uploads            || [];
  const downloads = da.downloads          || [];
  const dets      = da.detections         || [];
  const bytesDay  = da.total_bytes_per_day|| [];

  const sumArr = (arr) => arr.reduce((s, v) => s + (v || 0), 0);

  const totalUploads    = sumArr(uploads);
  const totalDownloads  = sumArr(downloads);
  const totalDetections = sumArr(dets);
  const totalBytes      = sumArr(bytesDay);

  // Active users — take the highest single-day distinct count as a proxy
  const dau = (raw.user_behaviour?.daily_active_users || []);
  const activeUsers = dau.length > 0 ? Math.max(...dau.map(d => d.active_users || 0)) : 0;

  // daily_trend: [{date, uploads, downloads, detections}]
  const daily_trend = dates.map((date, i) => ({
    date,
    uploads:    uploads[i]   || 0,
    downloads:  downloads[i] || 0,
    detections: dets[i]      || 0,
  }));

  // event_breakdown: [{event, count}] — used for the donut pie chart
  const event_breakdown = [
    { event: 'Uploads',    count: totalUploads    },
    { event: 'Downloads',  count: totalDownloads  },
    { event: 'AI Scans',   count: totalDetections },
  ].filter(e => e.count > 0);

  // hourly_pattern: [{hour, events}] — used for the 24-bar chart
  const busiest = raw.latency_analysis?.busiest_hours || [];
  const hourly_pattern = busiest.length > 0
    ? busiest.map(h => ({ hour: h.hour, events: h.event_count || 0 }))
    : Array.from({ length: 24 }, (_, h) => ({ hour: h, events: 0 }));

  // top_files: not tracked per-file in current backend; return empty array
  const top_files = [];

  // anomalies: suspicious users mapped to the shape the frontend renders
  const suspicious = raw.anomaly_detection?.suspicious_users || [];
  const anomalies = suspicious.map(u => ({
    user_id:          u.user_id,
    off_hours_events: u.event_count || 0,
    date:             String(u.hour || u.hour_bucket || ''),
  }));

  const sourceLabel = { hdfs: 'hdfs', local_cache: 'cache', supabase_live: 'live', empty: 'empty' };

  return {
    _source:         sourceLabel[source] || source,
    generated_at:    raw.generated_at,
    platform_totals: {
      total_events:         totalUploads + totalDownloads + totalDetections,
      active_users:         activeUsers,
      total_bytes_uploaded: totalBytes || raw._summary?.today_bytes || 0,
    },
    daily_trend,
    top_files,
    event_breakdown,
    hourly_pattern,
    anomalies,
  };
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', authenticateToken, async (req, res) => {
  res.set('Cache-Control', 'max-age=60');

  // Tier 1 — HDFS
  try {
    const data = await readFromHDFS();
    logger.info('[analytics] Served from HDFS', { requestId: req.id });
    return res.status(200).json(normalizeForFrontend(data, 'hdfs'));
  } catch (err) {
    logger.warn('[analytics] HDFS unavailable, trying local cache', { error: err.message });
  }

  // Tier 2 — local file
  try {
    const data = readFromLocal();
    logger.info('[analytics] Served from local cache', { requestId: req.id });
    return res.status(200).json(normalizeForFrontend(data, 'local_cache'));
  } catch (err) {
    logger.warn('[analytics] Local cache unavailable, deriving from Supabase', { error: err.message });
  }

  // Tier 3 — Supabase live analytics
  try {
    const data = await readFromSupabase();
    logger.info('[analytics] Served from Supabase live', { requestId: req.id });
    return res.status(200).json(normalizeForFrontend(data, 'supabase_live'));
  } catch (err) {
    logger.error('[analytics] All tiers failed, returning empty payload', { error: err.message });
  }

  // Tier 4 — graceful empty (never 503)
  return res.status(200).json(normalizeForFrontend(emptyPayload(), 'empty'));
});

// ─── POST /trigger ────────────────────────────────────────────────────────────

router.post('/trigger', authenticateToken, (req, res) => {
  logger.info('[analytics] Triggering analytics job', { requestId: req.id });

  try {
    fs.accessSync(SCRIPT_PATH, fs.constants.F_OK);
  } catch {
    logger.warn('[analytics] run_analytics.sh not found', { path: SCRIPT_PATH });
    return res.status(202).json({
      status:  'skipped',
      message: 'Analytics script not found. Analytics data is served live from Supabase.',
    });
  }

  const child = spawn('bash', [SCRIPT_PATH], {
    env: {
      PATH:             process.env.PATH,
      HOME:             process.env.HOME,
      TMPDIR:           process.env.TMPDIR || '/tmp',
      PYTHON:           process.env.PYTHON,
      HDFS_WEBHDFS_URL: process.env.HDFS_WEBHDFS_URL,
      HDFS_USER:        process.env.HDFS_USER,
    },
    detached: true,
    stdio:    ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', d => logger.info('[analytics/trigger] ' + d.toString().trim()));
  child.stderr.on('data', d => logger.warn('[analytics/trigger] ' + d.toString().trim()));
  child.on('error', err => logger.error('[analytics/trigger] spawn error', { error: err.message }));
  child.unref();

  return res.status(202).json({
    status:  'triggered',
    message: 'Analytics job started in background. Refresh in ~30s to see updated results.',
  });
});

module.exports = router;
