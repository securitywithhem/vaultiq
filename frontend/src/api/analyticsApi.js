// VaultIQ — Analytics API client

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetch the latest analytics results.
 * Tries HDFS → local cache → Supabase live counts (handled server-side).
 * @returns {Promise<Object>} Analytics payload including source, generated_at, and 6 analytic keys
 * @throws {Error} with message on non-2xx response
 */
export async function fetchAnalytics() {
  const response = await fetch(`${BASE}/api/analytics`, {
    headers: { ...getAuthHeaders() },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Analytics request failed (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Trigger the analytics job (Spark or Python fallback) in the background.
 * Returns immediately — results will be available after the job completes.
 * @returns {Promise<{ status: string, message: string }>}
 * @throws {Error} with message on non-2xx response
 */
export async function triggerAnalyticsJob() {
  const response = await fetch(`${BASE}/api/analytics/trigger`, {
    method:  'POST',
    headers: { ...getAuthHeaders() },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Trigger failed (HTTP ${response.status})`);
  }

  return response.json();
}
