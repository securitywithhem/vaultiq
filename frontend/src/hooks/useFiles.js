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
      setFiles(Array.isArray(data?.files) ? data.files : []);
      setHasMore(data?.hasMore ?? false);
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
      setFiles(prev => [...prev, ...(Array.isArray(data?.files) ? data.files : [])]);
      setHasMore(data?.hasMore ?? false);
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
      toast.success('File removed');
    } catch (err) {
      setFiles(previousFiles);
      toast.error('Failed to delete file');
    }
  }, [files]);

  const bulkDelete = useCallback(async (ids) => {
    const previousFiles = [...files];
    setFiles(prev => prev.filter(f => !ids.includes(f.id)));
    try {
      const res = await fileService.bulkDeleteFiles(ids);
      const count = res?.data?.deleted ?? ids.length;
      toast.success(`${count} file${count !== 1 ? 's' : ''} deleted`);
    } catch {
      setFiles(previousFiles);
      toast.error('Bulk delete failed');
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
    deleteFile,
    bulkDelete
  };
};
