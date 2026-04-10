import { useState, useCallback } from 'react';
import { fileService } from '../services/fileService';
import toast from 'react-hot-toast';

export const useFiles = () => {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const fetchFiles = useCallback(async (signal) => {
    setIsLoading(true);
    setPage(0);
    try {
      const data = await fileService.getFiles(0, { signal });
      setFiles(data.files);
      setHasMore(data.hasMore);
    } catch (err) {
      if (err.name !== 'CanceledError') {
        toast.error('Failed to load files');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const data = await fileService.getFiles(nextPage);
      setFiles(prev => [...prev, ...data.files]);
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch {
      toast.error('Failed to load more files');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, page]);

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
    isLoadingMore,
    hasMore,
    fetchFiles,
    loadMore,
    addFileOptimistic,
    deleteFile
  };
};
