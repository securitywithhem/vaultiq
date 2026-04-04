/**
 * @file hdfsLogger.js
 * @description Fault-tolerant event logger for HDFS with Supabase fallback
 * @dependencies node-fetch, supabase
 * @exports logEvent
 */

const fetch = require('node-fetch');
const { supabaseAdmin } = require('./supabase');

/**
 * Helper for delays (ms)
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @function logEvent
 * @description Fault-tolerant event logger for HDFS with Supabase fallback
 * @param {Object} eventData - The event payload to store
 */
async function logEvent(eventData) {
  const MAX_RETRIES = 3;
  let attempt = 0;
  let success = false;

  const payload = { 
    timestamp: new Date().toISOString(), 
    ...eventData 
  };

  // Tier 1: HDFS Primary Storage with Retries
  while (attempt < MAX_RETRIES && !success) {
    try {
      const baseUrl = process.env.HDFS_WEBHDFS_URL;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // Adding randomness to filename to prevent collisions in high-concurrency environments
      const fileName = `/vaultiq/logs/${timestamp}_${Math.random().toString(36).substring(7)}_event.json`;
      
      const createUrl = `${baseUrl}${fileName}?op=CREATE&overwrite=true`;
      const res = await fetch(createUrl, { method: 'PUT', timeout: 5000 });
      
      if (res.status === 307 || res.status === 201) {
        const redirectUrl = res.headers.get('location');
        if (redirectUrl) {
          const writeRes = await fetch(redirectUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: JSON.stringify(payload)
          });
          if (writeRes.ok) {
            success = true;
          }
        }
      }
    } catch (err) {
      attempt++;
      console.warn(`[logEvent] HDFS attempt ${attempt} failed:`, err.message);
      if (attempt < MAX_RETRIES) await delay(1000 * attempt); // Exponential-ish backoff
    }
  }

  // Tier 2: Supabase Fallback (if HDFS fails)
  if (!success) {
    try {
      const { error } = await supabaseAdmin
        .from('system_logs')
        .insert([{ 
          event_type: eventData.event || 'generic',
          user_id: eventData.user_id || null,
          payload: payload,
          source: 'backend_fallback'
        }]);

      if (error) {
        console.error('[logEvent] Supabase Fallback Error:', error.message);
        throw error;
      }
      console.log('[logEvent] Successfully fell back to Supabase');
    } catch (dbErr) {
      console.error('[logEvent] FATAL: All logging tiers failed:', dbErr.message);
    }
  }
}

module.exports = { logEvent };
