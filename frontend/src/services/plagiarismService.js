/**
 * @file plagiarismService.js
 * @description API service calls for plagiarism detection
 * @dependencies api (axios instance)
 * @exports checkPlagiarism
 */

import api from './api';

export const checkPlagiarism = async (text) => {
  try {
    const response = await api.post('/api/plagiarism/check', { text });
    return response.data;
  } catch (err) {
    const message = err.response?.data?.error || 'Plagiarism scan failed';
    throw new Error(message);
  }
};

export const addToCorpus = async (doc_id, text) => {
  try {
    const response = await api.post('/api/plagiarism/add', { doc_id, text });
    return response.data;
  } catch (err) {
    const message = err.response?.data?.error || 'Failed to update scan corpus';
    throw new Error(message);
  }
};
