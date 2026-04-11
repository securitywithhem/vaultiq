// AI Detection API client

import api from '../services/api';

/**
 * Detect AI content by uploading new files directly.
 * @param {File[]} files - up to 5 browser File objects
 */
export const detectFiles = async (files) => {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  try {
    const response = await api.post('/api/ai-detect', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 minute timeout for analysis
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 503) {
      throw new Error('AI Analysis service is unavailable. Please try again in a few moments.');
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('Analysis took too long. Please try with smaller files.');
    }
    if (!error.response) {
      throw new Error('Cannot connect to server. Please check your connection.');
    }
    throw new Error(error.response?.data?.error || 'Error communicating with analysis service');
  }
};

/**
 * Detect AI content on files already stored in the vault.
 * @param {string[]} fileIds - array of vault file UUIDs (max 5)
 */
export const detectVaultFiles = async (fileIds) => {
  try {
    const response = await api.post('/api/ai-detect/from-vault', { fileIds }, {
      timeout: 120000, // 2 minute timeout for analysis
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 503) {
      throw new Error('AI Analysis service is unavailable. Please try again in a few moments.');
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('Analysis took too long. Please try with fewer files.');
    }
    if (!error.response) {
      throw new Error('Cannot connect to server. Please check your connection.');
    }
    throw new Error(error.response?.data?.error || 'Error running analysis on vault files');
  }
};

/**
 * Fetch the authenticated user's AI detection history.
 */
export const fetchAIHistory = async () => {
  const response = await api.get('/api/ai-detect/history');
  return response.data.detections || [];
};
