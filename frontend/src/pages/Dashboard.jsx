<<<<<<< HEAD
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
=======
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import AppNavbar from '../components/ui/AppNavbar';
import { useAuth } from '../hooks/useAuth';
import { fileService } from '../services/fileService';

// ─── Motion presets ───────────────────────────────────────────────────────────

const EASE = [0.25, 0.1, 0.25, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
};

// NOTE: All color class strings are static so Tailwind JIT scans them correctly.
const FEATURE_CARDS = [
  {
    to: '/files',
    title: 'Secure Vault',
    description: 'AES-256 encrypted files with SHA-256 integrity verification.',
    iconBg: 'bg-emerald-500/10', iconRing: 'ring-emerald-500/20', iconText: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 text-emerald-400',
    arrowColor: 'text-emerald-400',
    glow: 'rgba(16,185,129,0.12)',
    icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>),
  },
  {
    to: '/ai-detection',
    title: 'AI Detection',
    description: 'Detect AI-generated content with deep learning NLP models.',
    iconBg: 'bg-violet-500/10', iconRing: 'ring-violet-500/20', iconText: 'text-violet-400',
    badgeBg: 'bg-violet-500/10 text-violet-400',
    arrowColor: 'text-violet-400',
    glow: 'rgba(139,92,246,0.12)',
    icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>),
  },
  {
    to: '/analytics',
    title: 'Analytics',
    description: 'Upload trends, scan history, and storage insights.',
    iconBg: 'bg-sky-500/10', iconRing: 'ring-sky-500/20', iconText: 'text-sky-400',
    badgeBg: 'bg-sky-500/10 text-sky-400',
    arrowColor: 'text-sky-400',
    glow: 'rgba(14,165,233,0.12)',
    icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>),
  },
];

const GUIDED_STEPS = [
  { n: '1', label: 'Upload File',    sub: 'AES-256 encryption', to: '/files',        color: 'emerald' },
  { n: '2', label: 'AI Scan',        sub: 'Detect AI content',  to: '/ai-detection', color: 'violet'  },
  { n: '3', label: 'View Analytics', sub: 'Monitor everything', to: '/analytics',    color: 'sky'     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── Recharts tooltip ─────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700/80 rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-xs font-semibold text-gray-400 mb-2">{label}</p>
      {payload.map((e) => (
        <p key={e.dataKey} className="text-xs font-medium" style={{ color: e.color }}>
          {e.dataKey === 'uploads' ? 'Uploads' : 'AI Scans'}: {e.value}
        </p>
      ))}
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const firstName = user?.fullName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';

  // ── Real stats from backend ────────────────────────────────────────────────
  const [stats, setStats]         = useState({ totalFiles: null, storageBytes: null });
  const [statsLoading, setLoading] = useState(true);
>>>>>>> main

  useEffect(() => {
    fileService.getStats()
      .then((data) => setStats(data))
      .catch(() => {/* show dashes on error */})
      .finally(() => setLoading(false));
  }, []);

<<<<<<< HEAD
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
=======
  const fileCount   = statsLoading ? '…' : (stats?.totalFiles ?? '—');
  const storageUsed = statsLoading ? '…' : (stats?.storageBytes != null ? formatBytes(stats.storageBytes) : '—');
>>>>>>> main

  const STATS = [
    {
      label: 'Total Files',
      value: fileCount,
      sub: 'Encrypted in vault',
      iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-400',
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>),
    },
    {
      label: 'Storage Used',
      value: storageUsed,
      sub: 'AES-256 encrypted',
      iconBg: 'bg-sky-500/10', iconText: 'text-sky-400',
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>),
    },
    {
      label: 'AI Detections',
      value: '—',
      sub: 'Run a scan to track',
      iconBg: 'bg-violet-500/10', iconText: 'text-violet-400',
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>),
    },
    {
      label: 'Integrity Checks',
      value: fileCount === '…' ? '…' : fileCount === '—' ? '—' : String(stats?.totalFiles ?? 0),
      sub: 'SHA-256 verified',
      iconBg: 'bg-amber-500/10', iconText: 'text-amber-400',
      icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>),
    },
  ];

  // Placeholder chart — real data comes from Analytics page
  const CHART_DATA = [
    { day: 'Mon', uploads: 0, scans: 0 },
    { day: 'Tue', uploads: 0, scans: 0 },
    { day: 'Wed', uploads: 0, scans: 0 },
    { day: 'Thu', uploads: 0, scans: 0 },
    { day: 'Fri', uploads: 0, scans: 0 },
    { day: 'Sat', uploads: 0, scans: 0 },
    { day: 'Sun', uploads: 0, scans: 0 },
  ];

  const QUICK_ACTIONS = [
    { label: 'Upload File',    to: '/files',        iconText: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40', icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>) },
    { label: 'Scan Document',  to: '/ai-detection', iconText: 'text-violet-400', bg: 'bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20 hover:border-violet-500/40', icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>) },
    { label: 'View Analytics', to: '/analytics',    iconText: 'text-sky-400',    bg: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20 hover:border-sky-500/40', icon: (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>) },
  ];

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
<<<<<<< HEAD
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
=======
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900/30 to-gray-950 font-sans antialiased">
      <AppNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-8">

          {/* ── Hero ────────────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">
                Good to see you back, {firstName}
              </p>
              <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">
                Secure your data.<br />
                <span className="text-gray-500 font-light">Detect AI. Monitor everything.</span>
              </h1>
            </div>

            <motion.button
              type="button"
              onClick={() => navigate('/files')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 20 }}
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-colors duration-150"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload File
            </motion.button>
          </motion.div>

          {/* ── Guided flow ─────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
                Guided workflow
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {GUIDED_STEPS.map((step, i) => (
                  <React.Fragment key={step.n}>
                    <motion.button
                      type="button"
                      onClick={() => navigate(step.to)}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                      className="flex items-center gap-3 flex-1 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 hover:border-gray-600 rounded-xl px-4 py-3 text-left transition-colors duration-150 w-full sm:w-auto"
                    >
                      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                        step.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                        step.color === 'violet'  ? 'bg-violet-500/20  text-violet-400'  :
                                                   'bg-sky-500/20     text-sky-400'
                      }`}>{step.n}</span>
                      <div>
                        <p className="text-xs font-semibold text-white">{step.label}</p>
                        <p className="text-[10px] text-gray-500">{step.sub}</p>
                      </div>
                    </motion.button>

                    {i < GUIDED_STEPS.length - 1 && (
                      <svg className="w-4 h-4 text-gray-700 shrink-0 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── Stats row ───────────────────────────────────────────────────── */}
          <motion.div variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STATS.map(({ label, value, sub, icon, iconBg, iconText }) => (
              <motion.div
                key={label}
                variants={fadeUp}
                whileHover={{ y: -2 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="bg-gray-900/80 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 cursor-default"
              >
                <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center mb-4`}>
                  <span className={iconText}>{icon}</span>
>>>>>>> main
                </div>
                <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                <p className="text-xs text-gray-600 mt-1">{sub}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Feature cards ───────────────────────────────────────────────── */}
          <motion.div variants={stagger} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURE_CARDS.map(({ to, title, description, iconBg, iconRing, iconText, badgeBg, arrowColor, glow, icon }) => (
              <motion.button
                key={to}
                type="button"
                onClick={() => navigate(to)}
                variants={fadeUp}
                initial="rest"
                whileHover="hover"
                whileTap={{ scale: 0.98 }}
                animate="rest"
                className="relative group text-left bg-gray-900/80 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {/* Per-card colored glow */}
                <motion.div
                  variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{ boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04), 0 8px 32px ${glow}` }}
                  aria-hidden="true"
                />

                <div className="flex items-start justify-between">
                  <div className={`w-9 h-9 rounded-xl ${iconBg} ring-1 ${iconRing} flex items-center justify-center`}>
                    <span className={iconText}>{icon}</span>
                  </div>
                </div>

                <div className="flex-1">
                  <p className="text-sm font-semibold text-white mb-1">{title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
                </div>

                <motion.div
                  variants={{ rest: { x: 0 }, hover: { x: 2 } }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className={`flex items-center gap-1 text-xs font-semibold ${arrowColor}`}
                >
                  Open
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </motion.div>
              </motion.button>
            ))}
          </motion.div>

          {/* ── Chart + Quick Actions ────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Area chart — 2 cols */}
            <div className="lg:col-span-2 bg-gray-900/80 border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-sm font-semibold text-white">Activity Overview</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Full analytics available on the Analytics page</p>
                </div>
                <motion.button
                  type="button"
                  onClick={() => navigate('/analytics')}
                  whileHover={{ x: 2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="text-xs font-semibold text-gray-500 hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  View all
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </motion.button>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={CHART_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gUploads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10B981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}    />
                    </linearGradient>
                    <linearGradient id="gScans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="uploads" stroke="#10B981" strokeWidth={1.5} fill="url(#gUploads)" dot={false} />
                  <Area type="monotone" dataKey="scans"   stroke="#8B5CF6" strokeWidth={1.5} fill="url(#gScans)"   dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Quick actions — 1 col */}
            <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-white mb-5">Quick Actions</h2>
              <div className="space-y-2.5">
                {QUICK_ACTIONS.map(({ label, to, icon, iconText, bg }) => (
                  <motion.button
                    key={to}
                    type="button"
                    onClick={() => navigate(to)}
                    whileHover={{ x: 2 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border ${bg} text-left transition-colors duration-150`}
                  >
                    <span className={iconText}>{icon}</span>
                    <span className="text-sm font-medium text-gray-300">{label}</span>
                    <svg className="w-3.5 h-3.5 text-gray-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </motion.button>
                ))}
              </div>

              {/* Live indicator */}
              <div className="mt-6 pt-5 border-t border-gray-800 flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-xs text-emerald-400 font-medium">Vault online</span>
                <span className="text-xs text-gray-600 ml-auto">AES-256 active</span>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </main>

      {/* File details modal */}
      {detailFile && (
        <FileDetailsModal file={detailFile} onClose={() => setDetailFile(null)} />
      )}
    </div>
  );
};

export default Dashboard;
