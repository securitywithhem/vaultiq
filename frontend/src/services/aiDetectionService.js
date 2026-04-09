/**
 * @file aiDetectionService.js
 * @description API service calls for text-based AI detection
 * @dependencies api (axios instance)
 * @exports detectTextAi
 */

import api from './api';

export const detectTextAi = async (text) => {
  try {
    const response = await api.post('/api/ai-detect-text/check', { text });
    return response.data;
  } catch (err) {
    const message = err.response?.data?.error || 'AI text scan failed';
    throw new Error(message);
  }
};

export const addToAnalysisCorpus = async (doc_id, text) => {
  try {
    const response = await api.post('/api/ai-detect-text/add', { doc_id, text });
    return response.data;
  } catch (err) {
    const message = err.response?.data?.error || 'Failed to update analysis corpus';
    throw new Error(message);
  }
};
