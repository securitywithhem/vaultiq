/**
 * @file hdfsLogger.js
 * @description Fault-tolerant event logger: HDFS primary, Supabase fallback.
 *   - If HDFS_ENABLED !== 'true', skips HDFS entirely (zero retry, zero delay).
 *   - logEvent() is fire-and-forget: always returns void, never throws.
 *   - Log path: /vaultiq/logs/{timestamp}_{event}_{user_id}.json
 * @dependencies node-fetch (v2), supabase
 * @exports logEvent
 */

const fetch = require('node-fetch');
const { supabaseAdmin } = require('./supabase');

/**
 * Two-step WebHDFS write:
 *   Step 1 → PUT to NameNode (no body) → expect 307 with DataNode Location
 *   Step 2 → PUT body to DataNode URL
 */
async function writeToHDFS(payload) {
  const baseUrl  = process.env.HDFS_WEBHDFS_URL;  // e.g. http://namenode:9870/webhdfs/v1
  const hdfsUser = process.env.HDFS_USER || 'root';

  const fileName = `${payload.timestamp}_${payload.event}_${payload.user_id}.json`;
  const hdfsPath = `/vaultiq/logs/${fileName}`;

  const createUrl = `${baseUrl}${hdfsPath}?op=CREATE&user.name=${encodeURIComponent(hdfsUser)}&overwrite=true`;

  // Step 1: initiate — NameNode responds 307 with DataNode Location, no body sent
  const initRes = await fetch(createUrl, {
    method:   'PUT',
    redirect: 'manual',   // must not auto-follow: PUT→GET mutation on redirect
    timeout:  5000
  });

  if (initRes.status !== 307) {
    throw new Error(`HDFS CREATE initiation returned ${initRes.status} (expected 307)`);
  }

  const dataNodeUrl = initRes.headers.get('location');
  if (!dataNodeUrl) {
    throw new Error('HDFS 307 redirect missing Location header');
  }

  // Step 2: write data to DataNode
  const writeRes = await fetch(dataNodeUrl, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body:    JSON.stringify(payload),
    timeout: 5000
  });

  if (!writeRes.ok) {
    throw new Error(`HDFS DataNode write returned ${writeRes.status}`);
  }
}

async function writeToSupabase(payload, source) {
  const { error } = await supabaseAdmin
    .from('event_logs')
    .insert([{
      event_type: payload.event  || 'generic',
      user_id:    payload.user_id || null,
      filename:   payload.filename  || null,
      file_size:  payload.file_size || null,
      ip:         payload.ip        || null,
      payload,
      source
    }]);

  if (error) throw new Error(error.message);
}

/**
 * @function logEvent
 * @description Fire-and-forget event logger. Never awaited by callers.
 * @param {Object} eventData
 * @param {string} eventData.event        - 'upload' | 'download' | 'delete'
 * @param {string} eventData.user_id
 * @param {string} [eventData.filename]
 * @param {number} [eventData.file_size]
 * @param {number} [eventData.timestamp]  - ms epoch (Date.now())
 * @param {string} [eventData.ip]
 */
function logEvent(eventData) {
  const payload = {
    event:     eventData.event,
    user_id:   eventData.user_id,
    filename:  eventData.filename  || null,
    file_size: eventData.file_size || null,
    ip:        eventData.ip        || null,
    timestamp: eventData.timestamp || Date.now()
  };

  // ── ENV GUARD ──────────────────────────────────────────────────────────
  // HDFS_ENABLED !== 'true'  →  skip HDFS entirely, write to Supabase now.
  // Zero retry, zero delay — local dev is unaffected.
  if (process.env.HDFS_ENABLED !== 'true') {
    writeToSupabase(payload, 'supabase_primary').catch(err => {
      console.error('[logEvent] Supabase write failed:', err.message);
    });
    return;
  }

  // ── HDFS ENABLED ───────────────────────────────────────────────────────
  // Single attempt. On any failure, fall back to Supabase immediately.
  writeToHDFS(payload).catch(hdfsErr => {
    console.warn('[logEvent] HDFS failed, falling back to Supabase:', hdfsErr.message);
    writeToSupabase(payload, 'supabase_fallback').catch(dbErr => {
      console.error('[logEvent] FATAL: all logging tiers failed:', dbErr.message);
    });
  });
}

module.exports = { logEvent };
