/**
 * @file test-hdfs-log.js
 * @description Integration test: write an event via logEvent(), then read it
 *              back from HDFS via WebHDFS GET.
 *
 * Usage (HDFS must be running):
 *   HDFS_ENABLED=true node scripts/test-hdfs-log.js
 *
 * Exit code 0 = success, 1 = failure.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fetch      = require('node-fetch');
const { logEvent } = require('../utils/hdfsLogger');

// ── Dummy event ───────────────────────────────────────────────────────────────
const TEST_USER_ID = 'test-user-000';
const TEST_TS      = Date.now();

const dummyEvent = {
  event:     'upload',
  user_id:   TEST_USER_ID,
  filename:  'test-document.pdf',
  file_size: 12345,
  timestamp: TEST_TS,
  ip:        '127.0.0.1'
};

// Reconstruct the exact HDFS path logEvent() will use
const expectedFileName = `${TEST_TS}_${dummyEvent.event}_${dummyEvent.user_id}.json`;
const hdfsPath         = `/vaultiq/logs/${expectedFileName}`;

async function readFromHDFS(hdfsPath) {
  const baseUrl  = process.env.HDFS_WEBHDFS_URL;
  const hdfsUser = process.env.HDFS_USER || 'root';

  const openUrl = `${baseUrl}${hdfsPath}?op=OPEN&user.name=${encodeURIComponent(hdfsUser)}`;

  // WebHDFS OPEN redirects to DataNode; node-fetch follows GET redirects automatically
  const res = await fetch(openUrl, { method: 'GET', timeout: 5000 });

  if (!res.ok) {
    throw new Error(`WebHDFS GET returned ${res.status} for ${hdfsPath}`);
  }

  return res.text();
}

async function main() {
  if (process.env.HDFS_ENABLED !== 'true') {
    console.error(
      '[test-hdfs-log] HDFS_ENABLED is not "true".\n' +
      'Run with: HDFS_ENABLED=true node scripts/test-hdfs-log.js'
    );
    process.exit(1);
  }

  console.log('[test-hdfs-log] Firing logEvent() ...');
  logEvent(dummyEvent);

  console.log('[test-hdfs-log] Waiting 2 s for write to complete ...');
  await new Promise(r => setTimeout(r, 2000));

  console.log(`[test-hdfs-log] Reading back: ${hdfsPath}`);

  try {
    const raw    = await readFromHDFS(hdfsPath);
    const parsed = JSON.parse(raw);

    console.log('\n[test-hdfs-log] ── Log contents ─────────────────────────');
    console.log(JSON.stringify(parsed, null, 2));
    console.log('─────────────────────────────────────────────────────────\n');

    // Sanity checks
    if (parsed.event !== dummyEvent.event) {
      throw new Error(`event mismatch: got "${parsed.event}"`);
    }
    if (parsed.user_id !== dummyEvent.user_id) {
      throw new Error(`user_id mismatch: got "${parsed.user_id}"`);
    }
    if (parsed.timestamp !== TEST_TS) {
      throw new Error(`timestamp mismatch: got ${parsed.timestamp}`);
    }

    console.log('[test-hdfs-log] PASS: log written and verified successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[test-hdfs-log] FAIL:', err.message);
    process.exit(1);
  }
}

main();
