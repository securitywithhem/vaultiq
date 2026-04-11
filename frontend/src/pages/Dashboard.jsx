import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import UploadZone from '../components/UploadZone';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import FileDetailsModal from '../components/FileDetailsModal';
import { useFiles } from '../hooks/useFiles';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { fileService } from '../services/fileService';
import styles from './Dashboard.module.css';

const TYPE_FILTERS = [
  { key: 'all',   label: 'All' },
  { key: 'pdf',   label: 'PDF' },
  { key: 'docx',  label: 'DOCX' },
  { key: 'txt',   label: 'TXT' },
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
  if (filter === 'pdf')  return mime.includes('pdf') || ext === 'pdf';
  if (filter === 'docx') return mime.includes('wordprocessingml') || ext === 'docx' || ext === 'docm';
  if (filter === 'txt')  return mime.includes('plain') || mime.includes('markdown') || mime.includes('rtf') || ['txt', 'md', 'rtf'].includes(ext);
  // 'other'
  return !['pdf', 'docx', 'txt'].includes(filter) && !matchesType(file, 'pdf') && !matchesType(file, 'docx') && !matchesType(file, 'txt');
}

const Dashboard = () => {
  const { files, isLoading, isLoadingMore, hasMore, fetchFiles, loadMore, addFileOptimistic, deleteFile, bulkDelete } = useFiles();

  const [search,       setSearch]       = useState('');
  const [sortBy,       setSortBy]       = useState('date');
  const [sortDir,      setSortDir]      = useState('desc');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds,  setSelectedIds]  = useState(new Set());
  const [detailFile,   setDetailFile]   = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchFiles(controller.signal);
    return () => controller.abort();
  }, [fetchFiles]);

  // Reset selection when leaving selection mode
  useEffect(() => {
    if (!selectionMode) setSelectedIds(new Set());
  }, [selectionMode]);

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const processedFiles = useMemo(() => {
    let result = [...files];

    // Search filter
    const q = search.trim().toLowerCase();
    if (q) result = result.filter(f => f.filename.toLowerCase().includes(q));

    // Type filter
    if (typeFilter !== 'all') result = result.filter(f => matchesType(f, typeFilter));

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(b.uploaded_at) - new Date(a.uploaded_at);
      if (sortBy === 'name') cmp = a.filename.localeCompare(b.filename);
      if (sortBy === 'size') cmp = b.file_size - a.file_size;
      return sortDir === 'asc' ? -cmp : cmp;
    });

    return result;
  }, [files, search, typeFilter, sortBy, sortDir]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === processedFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processedFiles.map(f => f.id)));
    }
  };

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

  const handleDownload = async (id, filename) => {
    await fileService.downloadFile(id, filename);
  };

  // Keyboard shortcuts
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
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        {/* Upload */}
        <section className={styles.uploadSection}>
          <UploadZone onUploadSuccess={addFileOptimistic} />
        </section>

        {/* Files Section */}
        <section className={styles.filesSection}>

          {/* Header row */}
          <div className={styles.sectionHeader}>
            <div className={styles.titleRow}>
              <h2 className={styles.sectionTitle}>Your Encrypted Files</h2>
              <span className={styles.badge}>{files.length}</span>
            </div>
            <button
              className={`${styles.selectBtn} ${selectionMode ? styles.selectBtnActive : ''}`}
              onClick={() => setSelectionMode(m => !m)}
            >
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
          </div>

          {/* Bulk action bar */}
          {selectionMode && (
            <div className={styles.bulkBar}>
              <label className={styles.selectAllLabel}>
                <div
                  className={`${styles.checkAll} ${allSelected ? styles.checkAllChecked : ''}`}
                  onClick={toggleSelectAll}
                >
                  {allSelected && (
                    <svg fill="none" viewBox="0 0 24 24" stroke="white" width="11" height="11">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span>
                  {selectedIds.size === 0
                    ? 'Select all'
                    : `${selectedIds.size} selected`}
                </span>
              </label>
              {selectedIds.size > 0 && (
                <button
                  className={styles.bulkDeleteBtn}
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                >
                  {isBulkDeleting
                    ? <span className={styles.spinner} />
                    : (
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="14" height="14">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )
                  }
                  Delete {selectedIds.size}
                </button>
              )}
            </div>
          )}

          {/* Search + Sort */}
          {!selectionMode && (
            <div className={styles.controls}>
              <div className={styles.searchBar}>
                <svg className={styles.searchIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  ref={searchRef}
                  className={styles.searchInput}
                  type="text"
                  placeholder="Search files… (press /)"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear">✕</button>
                )}
              </div>

              <div className={styles.sortRow}>
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    className={`${styles.sortBtn} ${sortBy === opt.key ? styles.sortBtnActive : ''}`}
                    onClick={() => toggleSort(opt.key)}
                  >
                    {opt.label}
                    {sortBy === opt.key && (
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="11" height="11">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                          d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Type filter chips */}
          {!selectionMode && (
            <div className={styles.filterChips}>
              {TYPE_FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`${styles.chip} ${typeFilter === f.key ? styles.chipActive : ''}`}
                  onClick={() => setTypeFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          {isLoading ? (
            <div className={styles.grid}>
              {[1, 2, 3, 4].map(i => <div key={i} className={styles.skeletonCard} />)}
            </div>
          ) : processedFiles.length === 0 ? (
            <EmptyState
              variant={hasFilters ? 'search' : 'vault'}
              message={search ? `No results for "${search}"` : hasFilters ? 'No files match this filter' : 'Your vault is empty'}
              submessage={hasFilters ? 'Try clearing the search or filter.' : 'Upload your first encrypted file above.'}
            />
          ) : (
            <>
              <div className={styles.grid}>
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
              </div>
              {!hasFilters && hasMore && !selectionMode && (
                <div className={styles.loadMoreRow}>
                  <button onClick={loadMore} disabled={isLoadingMore} className={styles.loadMoreBtn}>
                    {isLoadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* File details modal */}
      {detailFile && (
        <FileDetailsModal file={detailFile} onClose={() => setDetailFile(null)} />
      )}
    </div>
  );
};

export default Dashboard;
