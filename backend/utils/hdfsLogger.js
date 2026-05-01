// VaultIQ — Event Logger with Redis Queue + HDFS Primary + Supabase Fallback
// Pipeline: Redis batch queue → HDFS (WebHDFS) → Supabase (fallback)

const redis = require('redis');
const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// HDFS configuration
const HDFS_BASE    = process.env.HDFS_WEBHDFS_URL;  // http://namenode:9870/webhdfs/v1
const HDFS_USER    = process.env.HDFS_USER || 'root';
const HDFS_ENABLED = process.env.HDFS_ENABLED === 'true';

// Initialize Redis client
const redisClient = redis.createClient({
  url: REDIS_URL,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 500) }
});

redisClient.on('error', (err) => {
  console.error('[logEvent] Redis connection error:', err);
});

redisClient.connect().catch(err => {
  console.error('[logEvent] Failed to connect to Redis:', err);
});

// ── HDFS WRITER ───────────────────────────────────────────────────────────────
// Writes events as JSONL to HDFS via WebHDFS REST API.
// File path: /vaultiq/logs/YYYY-MM-DD/events.jsonl

async function writeEventsToHDFS(events) {
  const date = new Date().toISOString().split('T')[0];      // YYYY-MM-DD
  const hdfsPath = `/vaultiq/logs/${date}/events.jsonl`;
  const payload = events.map(e => JSON.stringify(e)).join('\n') + '\n';

  try {
    // Try APPEND first (file already exists for today)
    const appendUrl = `${HDFS_BASE}${hdfsPath}?op=APPEND&user.name=${HDFS_USER}`;
    await axios.post(appendUrl, payload, {
      headers: { 'Content-Type': 'application/octet-stream' },
      maxRedirects: 5,
      timeout: 15000
    });
  } catch (appendErr) {
    // File doesn't exist yet — CREATE it
    if (appendErr.response && (appendErr.response.status === 404 || appendErr.response.status === 400)) {
      const createUrl = `${HDFS_BASE}${hdfsPath}?op=CREATE&user.name=${HDFS_USER}&overwrite=false`;
      await axios.put(createUrl, payload, {
        headers: { 'Content-Type': 'application/octet-stream' },
        maxRedirects: 5,
        timeout: 15000
      });
    } else {
      // Re-throw if it's a different error (network, auth, etc.)
      throw appendErr;
    }
  }
}

// ── BATCH FLUSHER ─────────────────────────────────────────────────────────────
// Flushes queued events: HDFS primary → Supabase fallback

const BATCH_SIZE = 100;
const BATCH_TIMEOUT_MS = 5000; // 5 seconds

let flushTimer = null;

async function flushEventBatch() {
  try {
    // Get all events from queue
    const events = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const eventJSON = await redisClient.rPop('event_queue');
      if (!eventJSON) break;

      try {
        events.push(JSON.parse(eventJSON));
      } catch (parseErr) {
        console.error('[logEvent] Failed to parse event:', parseErr);
      }
    }

    if (events.length === 0) {
      return; // Nothing to flush
    }

    // ── Tier 1: Write to HDFS (primary) ─────────────────────────────────────
    if (HDFS_ENABLED && HDFS_BASE) {
      try {
        await writeEventsToHDFS(events);
        console.log(`[logEvent] Flushed ${events.length} events to HDFS`);
        return; // ✅ Primary succeeded — done
      } catch (hdfsErr) {
        console.error('[logEvent] HDFS write failed, falling back to Supabase:', hdfsErr.message);
      }
    }

    // ── Tier 2: Write to Supabase (fallback) ────────────────────────────────
    try {
      await axios.post(
        `${SUPABASE_URL}/rest/v1/event_logs`,
        events,
        {
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal' // Don't return inserted rows
          },
          timeout: 15000
        }
      );

      console.log(`[logEvent] Flushed ${events.length} events to Supabase (fallback)`);
    } catch (supabaseErr) {
      console.error('[logEvent] Supabase batch write also failed:', supabaseErr.message);

      // Put events back in queue for retry
      for (const event of events) {
        await redisClient.lPush('event_queue', JSON.stringify(event));
      }
    }
  } catch (err) {
    console.error('[logEvent] Batch flush error:', err);
  } finally {
    // Schedule next flush
    scheduleNextFlush();
  }
}

function scheduleNextFlush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }

  flushTimer = setTimeout(() => {
    flushEventBatch();
  }, BATCH_TIMEOUT_MS);
}

// Start flushing on startup
scheduleNextFlush();

// ── EVENT LOGGING ─────────────────────────────────────────────────────────────

async function logEvent(eventType, payload) {
  try {
    // Actual event_logs schema: id, user_id, event_type, file_id, metadata, latency_ms, created_at
    const event = {
      event_type: eventType,
      user_id: payload.userId,
      file_id: payload.fileId || null,
      latency_ms: payload.durationMs || payload.latencyMs || null,
      timestamp: new Date().toISOString(),   // Added for HDFS JSONL records
      metadata: {
        ...(payload.metadata || {}),
        file_name: payload.fileName || null,
        file_size_bytes: payload.fileSizeBytes || null,
        file_type: payload.fileType || null,
        ai_verdict: payload.aiVerdict || null,
        ai_score: payload.aiScore || null,
        ip_address: payload.ipAddress || null,
      }
    };

    // Add to Redis queue (fire-and-forget, no await)
    redisClient.lPush('event_queue', JSON.stringify(event))
      .catch(err => {
        console.error('[logEvent] Failed to queue event:', err.message);
      });

    // Check queue size and flush if needed
    const queueSize = await redisClient.lLen('event_queue');
    if (queueSize >= BATCH_SIZE) {
      flushEventBatch(); // Flush immediately if batch is full
    }

  } catch (err) {
    console.error('[logEvent] Error creating event:', err.message);
  }
}

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────────────
// Flush remaining events on process exit

async function gracefulShutdown() {
  console.log('[logEvent] Graceful shutdown: flushing remaining events...');

  // Flush any remaining events
  for (let i = 0; i < 10; i++) { // Try up to 10 times
    const queueSize = await redisClient.lLen('event_queue');
    if (queueSize === 0) break;

    await flushEventBatch();
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  await redisClient.quit();
  console.log('[logEvent] Redis connection closed');
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { logEvent };
