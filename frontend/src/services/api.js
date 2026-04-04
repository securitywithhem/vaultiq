import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true  // Important: Send cookies with every request
});

let csrfToken = '';

// Fetch CSRF token on app initialization
export const initCSRFToken = async () => {
  try {
    const res = await axios.get(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/csrf-token`, {
      withCredentials: true
    });
    csrfToken = res.data.csrfToken;
  } catch (err) {
    console.error('[api.initCSRFToken]', err.message);
  }
};

// Request interceptor to inject CSRF token and handle credentials
api.interceptors.request.use(
  (config) => {
    // Add CSRF token for state-changing requests
    if (['POST', 'PUT', 'DELETE'].includes(config.method.toUpperCase())) {
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401s and errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 - clear auth and redirect to login
    if (error.response && error.response.status === 401) {
      // Cookies are automatically cleared by httpOnly flag
      window.location.href = '/login';
    }
    
    // Fallback if backend is completely down
    if (!error.response && error.message === 'Network Error') {
      error.message = 'Connection failed. Is the backend running?';
    }
    
    return Promise.reject(error);
  }
);


export default api;
