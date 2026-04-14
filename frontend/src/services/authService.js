import api from './api';

export const authService = {
  register: async (email, password, fullName) => {
    try {
      const response = await api.post('/api/auth/register', { email, password, fullName });
      const data = response.data?.data || response.data;
      if (!data || !data.user) {
        throw new Error('Invalid response from server');
      }
      return data; // { user, token }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message || 'Registration failed';
      const err = new Error(errorMsg);
      err.response = error.response;
      throw err;
    }
  },

  login: async (email, password) => {
    try {
      const response = await api.post('/api/auth/login', { email, password });
      const data = response.data?.data || response.data;
      if (!data || !data.user) {
        throw new Error('Invalid response from server');
      }
      return data; // { user, token }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message || 'Login failed';
      const err = new Error(errorMsg);
      err.response = error.response;
      throw err;
    }
  },

  getMe: async () => {
    try {
      const response = await api.get('/api/auth/me');
      const data = response.data?.data || response.data;
      if (!data || !data.user) {
        throw new Error('Invalid response from server');
      }
      return data; // { user }
    } catch (error) {
      const err = new Error(error.response?.data?.error || error.message || 'Failed to get user');
      err.response = error.response;
      throw err;
    }
  },

  logout: async () => {
    try {
      const response = await api.post('/api/auth/logout');
      const data = response.data?.data || response.data;
      return data;
    } catch (error) {
      // Logout errors are non-critical
      console.error('Logout error:', error.message);
    }
  }
};
