// AI Detection Module — integrated 2026-04-08

import api from '../services/api';

export const detectFiles = async (files) => {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  try {
    const response = await api.post('/api/ai-detect', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Error communicating with analysis service');
  }
};
