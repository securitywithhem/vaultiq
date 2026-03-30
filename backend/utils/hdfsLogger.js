/**
 * =============================================================
 * VaultIQ — HDFS Event Logger (WebHDFS REST API)
 * =============================================================
 * Writes JSON event logs to HDFS via the WebHDFS REST endpoint.
 * All calls are fire-and-forget — errors are caught and logged
 * but never propagate to break file operations.
 *
 * HDFS path structure:
 *   /vaultiq/logs/YYYY-MM-DD/<timestamp>_<event>.json
 *
 * Event types: UPLOAD, DOWNLOAD, DELETE
 * =============================================================
 */

const fetch = require('node-fetch');

const getBaseUrl = () => process.env.HDFS_WEBHDFS_URL || 'http://localhost:9870/webhdfs/v1';
const HDFS_USER = 'hadoop';

/**
 * Write a JSON event log to HDFS.
 * This is intentionally fire-and-forget — called with .catch(console.error).
 *
 * @param {string} eventType  - UPLOAD | DOWNLOAD | DELETE
 * @param {object} data       - Event payload (user_id, filename, etc.)
 */
async function logToHDFS(eventType, data) {
  const baseUrl = getBaseUrl();
  const now = new Date();
  const dateDir = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filePath = `/vaultiq/logs/${dateDir}/${timestamp}_${eventType}.json`;

  const eventLog = {
    event: eventType,
    timestamp: now.toISOString(),
    ...data,
  };

  const content = JSON.stringify(eventLog, null, 2);

  try {
    // Step 1: Create the file (initial request gets redirect location)
    const createUrl = `${baseUrl}${filePath}?op=CREATE&user.name=${HDFS_USER}&overwrite=true&noredirect=true`;
    const createRes = await fetch(createUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 5000,
    });

    if (createRes.status === 307 || createRes.status === 201) {
      // Handle redirect — follow the location to the DataNode
      const createJson = await createRes.json().catch(() => null);
      const redirectUrl = createJson?.Location || createRes.headers.get('Location');

      if (redirectUrl) {
        await fetch(redirectUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: content,
          timeout: 5000,
        });
      }
    } else if (createRes.ok) {
      // Some WebHDFS setups handle it in one step with noredirect
      // File was created successfully
    }

    // TODO: remove in prod
    console.log(`[HDFS] Logged ${eventType} event → ${filePath}`);
  } catch (err) {
    // Non-blocking — log error but never throw
    // TODO: remove in prod
    console.error(`[HDFS] Failed to log ${eventType} event:`, err.message);
  }
}

/**
 * Read a file from HDFS via WebHDFS.
 * Used by the analytics route to read Spark result files.
 *
 * @param {string} path - HDFS path (e.g. /vaultiq/results/analytics.json)
 * @returns {Promise<object|null>} Parsed JSON or null if unavailable
 */
async function readFromHDFS(path) {
  const baseUrl = getBaseUrl();

  try {
    const url = `${baseUrl}${path}?op=OPEN&user.name=${HDFS_USER}&noredirect=true`;
    const res = await fetch(url, { timeout: 5000 });

    if (res.status === 307) {
      const resJson = await res.json().catch(() => null);
      const redirectUrl = resJson?.Location || res.headers.get('Location');
      if (redirectUrl) {
        const dataRes = await fetch(redirectUrl, { timeout: 5000 });
        if (dataRes.ok) {
          return await dataRes.json();
        }
      }
      return null;
    }

    if (res.ok) {
      return await res.json();
    }

    return null;
  } catch (err) {
    // TODO: remove in prod
    console.error(`[HDFS] Failed to read ${path}:`, err.message);
    return null;
  }
}

/**
 * List files in an HDFS directory.
 *
 * @param {string} dirPath - HDFS directory path
 * @returns {Promise<Array|null>} Array of file statuses or null
 */
async function listHDFS(dirPath) {
  const baseUrl = getBaseUrl();

  try {
    const url = `${baseUrl}${dirPath}?op=LISTSTATUS&user.name=${HDFS_USER}`;
    const res = await fetch(url, { timeout: 5000 });

    if (res.ok) {
      const data = await res.json();
      return data?.FileStatuses?.FileStatus || [];
    }

    return null;
  } catch (err) {
    console.error(`[HDFS] Failed to list ${dirPath}:`, err.message);
    return null;
  }
}

module.exports = { logToHDFS, readFromHDFS, listHDFS };
