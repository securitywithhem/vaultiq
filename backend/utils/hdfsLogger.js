/**
 * @file hdfsLogger.js
 * @description WebHDFS event logging engine
 * @dependencies node-fetch
 * @exports logEvent
 */

const fetch = require('node-fetch');

async function logEvent(eventData) {
  try {
    const baseUrl = process.env.HDFS_WEBHDFS_URL;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `/vaultiq/logs/${timestamp}_event.json`;
    const payload = JSON.stringify({ timestamp: new Date().toISOString(), ...eventData });

    const createUrl = `${baseUrl}${fileName}?op=CREATE&overwrite=true`;
    const res = await fetch(createUrl, { method: 'PUT' });
    
    if (res.status === 307 || res.status === 201) {
      const redirectUrl = res.headers.get('location');
      if (redirectUrl) {
        await fetch(redirectUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: payload
        });
      }
    }
  } catch (err) {
    console.error('[logEvent]', err.message);
  }
}

module.exports = { logEvent };
