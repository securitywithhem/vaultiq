import { useState, useCallback } from 'react';
import { fileService } from '../services/fileService';
import toast from 'react-hot-toast';

export const useFiles = () => {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fileService.getFiles();
      setFiles(data);
    } catch (err) {
      toast.error('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addFileOptimistic = useCallback((newFile) => {
    setFiles(prev => [newFile, ...prev]);
  }, []);

  const deleteFile = useCallback(async (id) => {
    const previousFiles = [...files];
    setFiles(prev => prev.filter(f => f.id !== id));
    
    try {
      await fileService.deleteFile(id);
      toast.success('File removed', { icon: '🗑️' });
    } catch (err) {
      setFiles(previousFiles);
      toast.error('Failed to delete file');
    }
  }, [files]);

  return {
    files,
    isLoading,
    fetchFiles,
    addFileOptimistic,
    deleteFile
  };
};
