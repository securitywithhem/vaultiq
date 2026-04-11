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
    }

    return Promise.reject(error);
  }
);

export default api;
