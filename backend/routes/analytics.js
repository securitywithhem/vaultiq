/**
 * @file analytics.js (Production — HDFS + Spark)
 * @description Analytics API with 4-tier reading strategy:
 *   Tier 1: HDFS (WebHDFS read of analytics_latest.json)  → source: 'hdfs'
 *   Tier 2: Local JSON cache (bigdata/results/)            → source: 'cache'
 *   Tier 3: Supabase live query                            → source: 'live'
 *   Tier 4: Empty payload                                  → source: 'empty'
 *
 * GET  /api/analytics           — returns analytics (tries all 4 tiers)
 * GET  /api/analytics/realtime  — returns live analytics from Supabase
 * POST /api/analytics/trigger   — spawns Spark analytics job in background
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const { supabaseAdmin } = require('../utils/supabase');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Configuration ────────────────────────────────────────────────────────────

const LOCAL_RESULTS_FILE = path.resolve(__dirname, '../../bigdata/results/analytics_latest.json');
const SCRIPT_PATH = path.resolve(__dirname, '../../bigdata/analytics_simple.py');

const HDFS_BASE = process.env.HDFS_WEBHDFS_URL;  // http://namenode:9870/webhdfs/v1
const HDFS_USER = process.env.HDFS_USER || 'root';
const HDFS_ENABLED = process.env.HDFS_ENABLED === 'true';

// ─── Tier 1 — HDFS Read (via WebHDFS) ────────────────────────────────────────

async function readFromHDFS() {
  if (!HDFS_ENABLED || !HDFS_BASE) return null;

  try {
    const hdfsPath = `/vaultiq/results/analytics_latest.json`;
    const openUrl = `${HDFS_BASE}${hdfsPath}?op=OPEN&user.name=${HDFS_USER}`;
    const res = await axios.get(openUrl, { timeout: 10000, maxRedirects: 5 });

    // Handle both string and object responses
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return data;
  } catch (err) {
    logger.warn('[analytics] HDFS read failed:', err.message);
    return null;
  }
}

// ─── Tier 2 — Local Cache ─────────────────────────────────────────────────────

function readFromLocal() {
  try {
    const raw = fs.readFileSync(LOCAL_RESULTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    logger.warn('[analytics] Local cache read failed:', err.message);
    return null;
  }
}

// ─── Tier 3 — Supabase Live (Real-time) ───────────────────────────────────────

async function readFromSupabaseRealtime() {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch last 24 hours of events — actual schema: id, user_id, event_type, file_id, metadata, latency_ms, created_at
    const { data: rawEvents, error } = await supabaseAdmin
      .from('event_logs')
      .select('event_type, user_id, file_id, metadata, latency_ms, created_at')
      .gte('created_at', last24h)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('[analytics] Supabase query error:', error.message);
      return null;
    }

    // Flatten metadata fields onto each event for easier processing
    const events = (rawEvents || []).map(ev => ({
      ...ev,
      file_size_bytes: ev.metadata?.file_size_bytes || 0,
      file_type: ev.metadata?.file_type || null,
      ai_verdict: ev.metadata?.ai_verdict || null,
      ai_score: ev.metadata?.ai_score || null,
      duration_ms: ev.latency_ms || null,
      timestamp: ev.created_at
    }));

    if (events.length === 0) {
      return {
        generated_at: now.toISOString(),
        data_points: 0,
        daily_activity: { dates: [], uploads: [], downloads: [], detections: [], total_bytes_per_day: [] },
        anomaly_detection: { delete_spikes: [], suspicious_users: [] },
        ai_usage_stats: { total_detections: 0, verdicts: {}, average_score: 0 },
        storage_analytics: { total_bytes_uploaded: 0, total_mb_uploaded: 0, file_types_breakdown: {} },
        latency_analysis: { avg_duration_ms: 0, median_duration_ms: 0, p95_duration_ms: 0, p99_duration_ms: 0 },
        user_behaviour: { total_unique_users: 0, active_users_24h: 0, avg_events_per_user: 0 }
      };
    }

    // ── Daily Activity ─────────────────────────────────────────────────────

    const dailyMap = {};
    const bytesByDay = {};

    for (const ev of events) {
      const date = ev.created_at.slice(0, 10); // YYYY-MM-DD

      if (!dailyMap[date]) {
        dailyMap[date] = { uploads: 0, downloads: 0, detections: 0 };
        bytesByDay[date] = 0;
      }

      if (ev.event_type === 'file_upload') {
        dailyMap[date].uploads++;
        bytesByDay[date] += ev.file_size_bytes || 0;
      }
      if (ev.event_type === 'file_download') dailyMap[date].downloads++;
      if (ev.event_type === 'ai_detection') dailyMap[date].detections++;
    }

    const dates = Object.keys(dailyMap).sort();
    const daily_activity = {
      dates,
      uploads: dates.map(d => dailyMap[d].uploads),
      downloads: dates.map(d => dailyMap[d].downloads),
      detections: dates.map(d => dailyMap[d].detections),
      total_bytes_per_day: dates.map(d => bytesByDay[d])
    };

    // ── AI Usage Stats ─────────────────────────────────────────────────────

    const aiEvents = events.filter(e => e.event_type === 'ai_detection');
    const verdictMap = {};
    let totalScore = 0;
    let scoreCount = 0;

    for (const ev of aiEvents) {
      if (ev.ai_verdict) {
        verdictMap[ev.ai_verdict] = (verdictMap[ev.ai_verdict] || 0) + 1;
      }
      if (ev.ai_score !== null && ev.ai_score !== undefined) {
        totalScore += ev.ai_score;
        scoreCount++;
      }
    }

    const ai_usage_stats = {
      total_detections: aiEvents.length,
      verdicts: verdictMap,
      average_score: scoreCount > 0 ? parseFloat((totalScore / scoreCount).toFixed(3)) : 0,
      high_confidence_ai: aiEvents.filter(e => e.ai_score > 0.8).length
    };

    // ── Storage Analytics ──────────────────────────────────────────────────

    const uploadEvents = events.filter(e => e.event_type === 'file_upload');
    const totalBytes = uploadEvents.reduce((sum, e) => sum + (e.file_size_bytes || 0), 0);

    const fileTypeMap = {};
    for (const ev of uploadEvents) {
      if (ev.file_type) {
        fileTypeMap[ev.file_type] = (fileTypeMap[ev.file_type] || 0) + 1;
      }
    }

    const storage_analytics = {
      total_bytes_uploaded: totalBytes,
      total_mb_uploaded: parseFloat((totalBytes / (1024 * 1024)).toFixed(2)),
      file_types_breakdown: fileTypeMap
    };

    // ── Anomaly Detection ──────────────────────────────────────────────────

    const deletesByDate = {};
    for (const ev of events.filter(e => e.event_type === 'file_delete')) {
      const date = ev.timestamp.slice(0, 10);
      deletesByDate[date] = (deletesByDate[date] || 0) + 1;
    }

    const deleteSpikes = Object.entries(deletesByDate)
      .filter(([, count]) => count > 5)
      .map(([date, delete_count]) => ({ date, delete_count }));

    // Suspicious users (>50 events per hour)
    const userHourMap = {};
    for (const ev of events) {
      const hour = ev.timestamp.slice(0, 13); // YYYY-MM-DDTHH
      const key = `${ev.user_id}|${hour}`;
      userHourMap[key] = (userHourMap[key] || 0) + 1;
    }

    const suspiciousUsers = Object.entries(userHourMap)
      .filter(([, count]) => count > 50)
      .map(([key, event_count]) => {
        const [user_id, hour] = key.split('|');
        return { user_id, hour, event_count };
      });

    const anomaly_detection = {
      delete_spikes: deleteSpikes,
      suspicious_users: suspiciousUsers
    };

    // ── Latency Analysis ───────────────────────────────────────────────────

    const durations = events
      .filter(e => e.duration_ms !== null && e.duration_ms !== undefined)
      .map(e => e.duration_ms)
      .sort((a, b) => a - b);

    let latency_analysis = {
      avg_duration_ms: 0,
      median_duration_ms: 0,
      p95_duration_ms: 0,
      p99_duration_ms: 0
    };

    if (durations.length > 0) {
      const sum = durations.reduce((a, b) => a + b, 0);
      latency_analysis = {
        avg_duration_ms: parseFloat((sum / durations.length).toFixed(2)),
        median_duration_ms: durations[Math.floor(durations.length / 2)],
        p95_duration_ms: durations[Math.floor(durations.length * 0.95)],
        p99_duration_ms: durations[Math.floor(durations.length * 0.99)]
      };
    }

    // ── User Behavior ──────────────────────────────────────────────────────

    const uniqueUsers = new Set(events.map(e => e.user_id));
    const eventsPerUser = {};
    for (const ev of events) {
      eventsPerUser[ev.user_id] = (eventsPerUser[ev.user_id] || 0) + 1;
    }

    const avgEventsPerUser = uniqueUsers.size > 0
      ? parseFloat((Object.values(eventsPerUser).reduce((a, b) => a + b, 0) / uniqueUsers.size).toFixed(2))
      : 0;

    const user_behaviour = {
      total_unique_users: uniqueUsers.size,
      active_users_24h: uniqueUsers.size,
      avg_events_per_user: avgEventsPerUser,
      top_users: Object.entries(eventsPerUser)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .reduce((acc, [uid, count]) => {
          acc[uid] = count;
          return acc;
        }, {})
    };

    return {
      generated_at: now.toISOString(),
      data_points: events.length,
      success: true,
      daily_activity,
      anomaly_detection,
      ai_usage_stats,
      storage_analytics,
      latency_analysis,
      user_behaviour
    };

  } catch (err) {
    logger.error('[analytics] Supabase realtime query failed:', err);
    return null;
  }
}

// ─── API ENDPOINTS ────────────────────────────────────────────────────────────

// GET /api/analytics — Return analytics using 4-tier fallback
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    // Tier 1: HDFS
    const hdfsData = await readFromHDFS();
    if (hdfsData) {
      return res.json({
        source: 'hdfs',
        data: hdfsData
      });
    }

    // Tier 2: Local cache
    const cached = readFromLocal();
    if (cached) {
      return res.json({
        source: 'cache',
        data: cached
      });
    }

    // Tier 3: Supabase live
    const realtime = await readFromSupabaseRealtime();
    if (realtime) {
      return res.json({
        source: 'live',
        data: realtime
      });
    }

    // Tier 4: Empty payload
    return res.json({
      source: 'empty',
      data: {
        generated_at: new Date().toISOString(),
        data_points: 0,
        error: 'No analytics data available'
      }
    });

  } catch (err) {
    logger.error('[analytics] GET /analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/analytics/realtime — Return live analytics from Supabase
router.get('/analytics/realtime', authenticateToken, async (req, res) => {
  try {
    const realtime = await readFromSupabaseRealtime();

    if (realtime) {
      return res.json({
        source: 'supabase_realtime',
        data: realtime
      });
    }

    // Fallback to cache
    const cached = readFromLocal();
    if (cached) {
      return res.json({
        source: 'local_cache_fallback',
        data: cached
      });
    }

    res.status(404).json({ error: 'No analytics data available' });

  } catch (err) {
    logger.error('[analytics] GET /analytics/realtime error:', err);
    res.status(500).json({ error: 'Failed to fetch realtime analytics' });
  }
});

// POST /api/analytics/trigger — Trigger Spark analytics job via Docker
router.post('/analytics/trigger', authenticateToken, async (req, res) => {
  try {
    logger.info('[analytics] Triggering Spark analytics job...');

    // Primary: Submit Spark job via docker exec
    if (HDFS_ENABLED) {
      const child = spawn('docker', [
        'exec', 'vaultiq-spark-master',
        'spark-submit',
        '--master', 'spark://spark-master:7077',
        '--executor-memory', '512m',
        '--driver-memory', '512m',
        '/opt/spark-jobs/analytics_job.py'
      ], {
        detached: true,
        stdio: 'ignore'
      });

      child.unref();

      return res.json({
        status: 'triggered',
        engine: 'spark',
        message: 'Spark analytics job started in background',
        check_at: '/api/analytics'
      });
    }

    // Fallback: Run simple Python analytics locally
    const child = spawn('python3', [SCRIPT_PATH], {
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    res.json({
      status: 'triggered',
      engine: 'python_local',
      message: 'Analytics job started in background (local fallback)',
      check_at: '/api/analytics'
    });

  } catch (err) {
    logger.error('[analytics] Trigger error:', err);
    res.status(500).json({ error: 'Failed to trigger analytics job' });
  }
});

module.exports = router;
