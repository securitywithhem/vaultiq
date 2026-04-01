import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to inject Authorization header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('vaultiq_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401s universally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and force reload to kick user back to login via AuthContext
      localStorage.removeItem('vaultiq_token');
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
