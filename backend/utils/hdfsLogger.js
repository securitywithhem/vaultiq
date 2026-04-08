// VaultIQ — HDFS Event Logger with Supabase fallback
// All logging is fire-and-forget: never awaited by the caller

const axios = require('axios');

const HDFS_BASE = process.env.HDFS_WEBHDFS_URL;
  // e.g. http://localhost:9870/webhdfs/v1
const HDFS_USER = process.env.HDFS_USER || 'hadoop';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function _writeToHDFS(logPath, eventJSON) {
  const createUrl = `${HDFS_BASE}${logPath}?op=CREATE&user.name=${HDFS_USER}&overwrite=false`;

  // Step 1: CREATE file if it doesn't exist (201 = created, 403 = already exists — both ok)
  try {
    await axios.put(createUrl, null, {
      headers: { 'Content-Type': 'application/octet-stream' },
      maxRedirects: 5,
      timeout: 10000
    });
  } catch (createErr) {
    const status = createErr.response?.status;
    if (status !== 403) {
      throw createErr;
    }
    // 403 = file already exists — continue to APPEND
  }

  // Step 2: APPEND the JSON line
  const appendUrl = `${HDFS_BASE}${logPath}?op=APPEND&user.name=${HDFS_USER}`;
  await axios.post(appendUrl, eventJSON + '\n', {
    headers: { 'Content-Type': 'application/octet-stream' },
    maxRedirects: 5,
    timeout: 10000
  });
}

async function _writeToSupabase(event) {
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/event_logs`, event, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }
    });
  } catch (err) {
    console.error('[logEvent] Supabase write failed:', err.message);
  }
}

async function logEvent(eventType, payload) {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const logPath = `/vaultiq/logs/${today}/events.jsonl`;

    const event = {
      event_type:      eventType,
      user_id:         payload.userId,
      file_name:       payload.fileName       || null,
      file_size_bytes: payload.fileSizeBytes   || null,
      file_type:       payload.fileType        || null,
      ai_verdict:      payload.aiVerdict       || null,
      ai_score:        payload.aiScore         || null,
      ip_address:      payload.ipAddress       || null,
      duration_ms:     payload.durationMs      || null,
      timestamp:       new Date().toISOString(),
      metadata:        payload.metadata        || {}
    };

    if (HDFS_BASE) {
      try {
        await _writeToHDFS(logPath, JSON.stringify(event));
      } catch (hdfsErr) {
        console.warn('[logEvent] HDFS failed, falling back to Supabase:', hdfsErr.message);
        await _writeToSupabase(event);
      }
    } else {
      await _writeToSupabase(event);
    }
  } catch (err) {
    console.error('[logEvent] All logging tiers failed:', err.message);
  }
}

module.exports = { logEvent };
