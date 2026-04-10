// VaultIQ — Analytics API client
// Fix 2: use shared axios instance (withCredentials: true) so HttpOnly auth
// cookies are sent cross-origin. Previously used fetch() with a dead
// getAuthHeaders() that read localStorage — always null, causing 401s.

import api from '../services/api';

/**
 * Fetch the latest analytics results.
 * Tries HDFS → local cache → Supabase live counts (handled server-side).
 * @returns {Promise<Object>} Analytics payload including source, generated_at, and 6 analytic keys
 * @throws {Error} with message on non-2xx response (axios throws automatically)
 */
export async function fetchAnalytics() {
  const response = await api.get('/api/analytics');
  return response.data;
}

/**
 * Trigger the analytics job (Spark or Python fallback) in the background.
 * Returns immediately — results will be available after the job completes.
 * @returns {Promise<{ status: string, message: string }>}
 * @throws {Error} with message on non-2xx response (axios throws automatically)
 */
export async function triggerAnalyticsJob() {
  const response = await api.post('/api/analytics/trigger');
  return response.data;
}
