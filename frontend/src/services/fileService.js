import api from './api';
import toast from 'react-hot-toast';

export const fileService = {
  uploadFile: async (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/api/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress
    });
    
    return response.data.data.file;
  },

  getFiles: async (page = 0, config = {}) => {
    const response = await api.get('/api/files', { ...config, params: { page } });
    return response.data.data; // { files, hasMore, page }
  },

  downloadFile: async (fileId, filename) => {
    try {
      const response = await api.get(`/api/files/${fileId}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (error.response && error.response.status === 409) {
        toast.error('⚠️ File integrity check FAILED — this file may have been tampered with', { duration: 8000 });
      } else {
        throw error;
      }
    }
  },

  deleteFile: async (fileId) => {
    const response = await api.delete(`/api/files/${fileId}`);
    return response.data;
  }
};
