import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppNavbar from '../components/ui/AppNavbar';
import UploadZone from '../components/UploadZone';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import FileDetailsModal from '../components/FileDetailsModal';
import { useFiles } from '../hooks/useFiles';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { fileService } from '../services/fileService';

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { key: 'all',   label: 'All' },
  { key: 'pdf',   label: 'PDF' },
  { key: 'docx',  label: 'DOCX' },
  { key: 'txt',   label: 'TXT' },
  { key: 'image', label: 'Images' },
  { key: 'other', label: 'Other' },
];

const SORT_OPTIONS = [
  { key: 'date', label: 'Date' },
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
];

function matchesType(file, filter) {
  if (filter === 'all') return true;
  const mime = file.mime_type || '';
  const ext  = file.filename?.split('.').pop()?.toLowerCase() || '';
  
  if (filter === 'pdf')   return mime.includes('pdf') || ext === 'pdf';
  if (filter === 'docx')  return mime.includes('word') || ext === 'docx' || ext === 'doc';
  if (filter === 'txt')   return mime.includes('plain') || mime.includes('markdown') || ['txt', 'md'].includes(ext);
  if (filter === 'image') return mime.includes('image');
  
  // 'other'
  const known = ['pdf', 'word', 'plain', 'markdown', 'image'];
  return filter === 'other' && !known.some(k => mime.includes(k));
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

const FileCardSkeleton = () => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="w-9 h-9 rounded-xl bg-gray-800" />
      <div className="w-20 h-4 rounded-full bg-gray-800" />
    </div>
    <div className="space-y-2">
      <div className="h-3.5 w-3/4 rounded bg-gray-800" />
      <div className="h-2.5 w-1/2 rounded bg-gray-800" />
      <div className="h-7 rounded-lg bg-gray-800 mt-3" />
    </div>
    <div className="flex gap-2 pt-3 border-t border-gray-800">
      <div className="flex-1 h-8 rounded-xl bg-gray-800" />
      <div className="w-9 h-8 rounded-xl bg-gray-800" />
    </div>
  </div>
);

// ─── FilesPage ────────────────────────────────────────────────────────────────

const FilesPage = () => {
  const { 
    files, isLoading, isLoadingMore, hasMore, 
    fetchFiles, loadMore, addFileOptimistic, 
    deleteFile, bulkDelete 
  } = useFiles();

  const [search,        setSearch]        = useState('');
  const [sortBy,        setSortBy]        = useState('date');
  const [sortDir,       setSortDir]       = useState('desc');
  const [typeFilter,    setTypeFilter]    = useState('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [detailFile,    setDetailFile]    = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const searchRef = useRef(null);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetchFiles(controller.signal);
    return () => controller.abort();
  }, [fetchFiles]);

  // ── Reset selection when leaving selection mode ──────────────────────────
  useEffect(() => {
    if (!selectionMode) setSelectedIds(new Set());
  }, [selectionMode]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  
  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const handleDownload = async (id, filename) => {
    await fileService.downloadFile(id, filename);
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} file${selectedIds.size !== 1 ? 's' : ''} permanently?`)) return;
    setIsBulkDeleting(true);
    try {
      await bulkDelete([...selectedIds]);
      setSelectionMode(false);
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedIds, bulkDelete]);

  // ── Processed files (memoized) ─────────────────────────────────────────────
  
  const processedFiles = useMemo(() => {
    let result = Array.isArray(files) ? [...files] : [];

    // Search filter
    const q = search.trim().toLowerCase();
    if (q) result = result.filter(f => f.filename.toLowerCase().includes(q));

    // Type filter
    if (typeFilter !== 'all') result = result.filter(f => matchesType(f, typeFilter));

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(b.uploaded_at) - new Date(a.uploaded_at);
      else if (sortBy === 'name') cmp = a.filename.localeCompare(b.filename);
      else if (sortBy === 'size') cmp = b.file_size - a.file_size;
      return sortDir === 'asc' ? -cmp : cmp;
    });

    return result;
  }, [files, search, typeFilter, sortBy, sortDir]);

  const toggleSelectAll = () => {
    if (selectedIds.size === processedFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processedFiles.map(f => f.id)));
    }
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  
  useKeyboardShortcuts({
    searchRef,
    onEscape: () => {
      if (detailFile) { setDetailFile(null); return; }
      if (selectionMode) { setSelectionMode(false); return; }
      setSearch('');
    },
    onDelete: () => {
      if (selectionMode && selectedIds.size > 0) handleBulkDelete();
    },
  });

  const hasFilters = search || typeFilter !== 'all';
  const allSelected = processedFiles.length > 0 && selectedIds.size === processedFiles.length;

  return (
    <div className="min-h-screen bg-gray-950 font-sans antialiased text-gray-200">
      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <motion.div 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Digital Vault</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Your Files</h1>
            <p className="text-gray-500 text-sm max-w-md leading-relaxed">
              AES-256 encrypted storage with SHA-256 integrity verification.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3"
          >
            <button
              type="button"
              onClick={() => setSelectionMode(!selectionMode)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all duration-200 ${
                selectionMode 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
              }`}
            >
              {selectionMode ? 'Cancel Selection' : 'Select Files'}
            </button>
            <button
              onClick={() => document.querySelector('input[type="file"]')?.click()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Upload
            </button>
          </motion.div>
        </div>

        {/* Upload Dropzone */}
        {!selectionMode && (
          <motion.section 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <UploadZone onUploadSuccess={addFileOptimistic} />
          </motion.section>
        )}

        {/* Bulk Action Bar */}
        <AnimatePresence>
          {selectionMode && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex items-center justify-between bg-gray-900/80 backdrop-blur-md border border-gray-800 rounded-2xl p-4 mb-6 shadow-xl sticky top-20 z-20"
            >
              <div className="flex items-center gap-4">
                <button 
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${allSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600'}`}>
                    {allSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-xs font-semibold">
                    {selectedIds.size === 0 ? 'Select All' : `${selectedIds.size} file${selectedIds.size !== 1 ? 's' : ''} selected`}
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={selectedIds.size === 0 || isBulkDeleting}
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-red-500 text-red-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isBulkDeleting ? (
                    <span className="w-3.5 h-3.5 border-2 border-red-800 border-t-red-400 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  )}
                  Delete Selection
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Controls: Search & Filter */}
        {!selectionMode && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
            <div className="flex-1 max-w-md relative group">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search files... (press /)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 hover:border-gray-700 focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 rounded-2xl py-3 pl-11 pr-4 text-sm text-white placeholder-gray-600 transition-all outline-none"
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {TYPE_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setTypeFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    typeFilter === f.key 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                      : 'bg-gray-900 border border-gray-800 text-gray-500 hover:text-gray-200 hover:border-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <div className="w-px h-4 bg-gray-800 mx-2 shrink-0" />
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => toggleSort(opt.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    sortBy === opt.key 
                      ? 'bg-gray-800 text-white border border-gray-700' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {opt.label}
                  {sortBy === opt.key && (
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content Section */}
        <section>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <FileCardSkeleton key={i} />)}
            </div>
          ) : processedFiles.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <EmptyState
                variant={hasFilters ? 'search' : 'vault'}
                message={search ? `No results for "${search}"` : hasFilters ? 'No files match this filter' : 'Your vault is empty'}
                submessage={hasFilters ? 'Try clearing the search or filter.' : 'Upload your first encrypted file above.'}
              />
            </motion.div>
          ) : (
            <>
              <motion.div 
                layout
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {processedFiles.map(file => (
                  <FileCard
                    key={file.id}
                    file={file}
                    onDownload={handleDownload}
                    onDelete={deleteFile}
                    onInfo={setDetailFile}
                    isSelected={selectedIds.has(file.id)}
                    onSelect={toggleSelect}
                    selectionMode={selectionMode}
                  />
                ))}
              </motion.div>

              {!hasFilters && hasMore && !selectionMode && (
                <div className="flex justify-center mt-12">
                  <button 
                    onClick={loadMore} 
                    disabled={isLoadingMore} 
                    className="group relative px-6 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm font-semibold text-gray-400 hover:text-white hover:border-gray-600 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      'Load More'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* Details Modal */}
      <AnimatePresence>
        {detailFile && (
          <FileDetailsModal
            file={detailFile}
            onClose={() => setDetailFile(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default FilesPage;
