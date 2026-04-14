import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send HttpOnly cookies with every request
});

// ── Silent token refresh ──────────────────────────────────────────────────────
// When any request gets a 401 (access token expired), try to silently refresh
// using the refresh token cookie before giving up and redirecting to /login.
// A queue is used so concurrent requests all wait for one refresh, not N.

let isRefreshing = false;
let waitQueue    = []; // callbacks waiting for refresh to complete

function flushQueue(success) {
  waitQueue.forEach((cb) => cb(success));
  waitQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const PUBLIC   = ['/login', '/signup'];
    const onPublic = PUBLIC.some((p) => window.location.pathname.startsWith(p));

    // On public pages a 401 is expected — don't refresh or redirect
    if (onPublic) {
      return Promise.reject(error);
    }

    const is401   = error.response?.status === 401;
    const retried = error.config?._retry;

    if (is401 && !retried) {
      error.config._retry = true;

      if (!isRefreshing) {
        // This request kicks off the refresh
        isRefreshing = true;
        try {
          // Use raw axios so this call bypasses our interceptor
          await axios.post(`${BASE}/api/auth/refresh`, {}, { withCredentials: true });
          isRefreshing = false;
          flushQueue(true);
          // Retry the original request — new access cookie is now set
          return api(error.config);
        } catch (_refreshErr) {
          isRefreshing = false;
          flushQueue(false);
          // Refresh token also expired — send to login
          window.location.href = '/login';
          return Promise.reject(error);
        }
      }

      // Another request is already refreshing — queue and wait
      return new Promise((resolve, reject) => {
        waitQueue.push((success) => {
          if (success) resolve(api(error.config));
          else reject(error);
        });
      });
    }

    // Network & Server error handling
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        error.message = 'Request timeout. Please try again.';
      } else if (error.message === 'Network Error' || !navigator.onLine) {
        error.message = `Cannot connect to ${process.env.REACT_APP_API_URL || 'backend'}. Is the backend running?`;
      }
    } else if (error.response.status >= 500) {
      error.message = error.response.data?.error || 'Server error. Please try again.';
    }

    return Promise.reject(error);
  },
);

export default api;
