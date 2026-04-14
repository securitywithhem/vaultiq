import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001';

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
<<<<<<< HEAD
  (error) => {
    // Handle 401 - clear auth and redirect to login
    // Handle 401 - Unauthorized
    if (error.response && error.response.status === 401) {
      // Do not hard-redirect here as it causes infinite loops when checking auth on the login page.
      // The AuthContext and ProtectedRoute components handle redirection gracefully.
      console.warn('[API] Unauthorized (401). Handling via application logic.');
    }

    // Network error handling
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        error.message = 'Request timeout. Please try again.';
      } else if (error.message === 'Network Error' || !navigator.onLine) {
        error.message = `Cannot connect to ${process.env.REACT_APP_API_URL}. Is the backend running?`;
      }
    }

    // Server error
    if (error.response?.status >= 500) {
      error.message = error.response?.data?.error || 'Server error. Please try again.';
=======
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

    // Non-401, or already retried — surface the error
    if (!error.response && error.message === 'Network Error') {
      error.message = 'Connection failed. Is the backend running?';
>>>>>>> main
    }

    return Promise.reject(error);
  },
);

export default api;
