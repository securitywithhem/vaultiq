import api from './api';

export const authService = {
  register: async (email, password, fullName) => {
    const response = await api.post('/api/auth/register', { email, password, fullName });
    return response.data.data; // { user, token }
  },

  login: async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password });
    return response.data.data; // { user, token }
  },

  getMe: async () => {
    const response = await api.get('/api/auth/me');
    return response.data.data; // { user }
  }
};
