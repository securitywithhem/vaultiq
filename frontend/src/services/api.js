import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true  // Important: Send cookies with every request
});

// Response interceptor to handle 401s and errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 — redirect to login only when on a protected page.
    // On /login or /signup the 401 is expected (no cookie yet) and must
    // not cause an infinite redirect loop.
    if (error.response && error.response.status === 401) {
      const PUBLIC = ['/login', '/signup'];
      const onPublic = PUBLIC.some((p) => window.location.pathname.startsWith(p));
      if (!onPublic) {
        window.location.href = '/login';
      }
    }

    // Fallback if backend is completely down
    if (!error.response && error.message === 'Network Error') {
      error.message = 'Connection failed. Is the backend running?';
    }

    return Promise.reject(error);
  }
);

export default api;
