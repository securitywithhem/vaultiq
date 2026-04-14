import React, { useState } from 'react';
import PropTypes from 'prop-types';
import HashBadge from './HashBadge';
import { formatFileSize, formatRelativeTime, truncateFilename } from '../utils/format';

// ─── Type config ─────────────────────────────────────────────────────────────

const typeConfig = (mimeType = '') => {
  if (mimeType.includes('pdf'))   return { bg: 'bg-red-500/10',    ring: 'ring-red-500/20',    text: 'text-red-400'    };
  if (mimeType.includes('image')) return { bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/20', text: 'text-yellow-400' };
  return                                 { bg: 'bg-sky-500/10',     ring: 'ring-sky-500/20',    text: 'text-sky-400'    };
};

const TypeIcon = ({ mimeType = '' }) => {
  if (mimeType.includes('pdf')) return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
  if (mimeType.includes('image')) return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
};

// ─── FileCard ─────────────────────────────────────────────────────────────────

<<<<<<< HEAD
const FILE_ICONS = {
  pdf: {
    color: '#ff453a',
    bg: 'rgba(255,69,58,0.1)',
    path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  word: {
    color: '#0a84ff',
    bg: 'rgba(10,132,255,0.1)',
    path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  text: {
    color: '#ff9f0a',
    bg: 'rgba(255,159,10,0.1)',
    path: 'M4 6h16M4 10h16M4 14h10',
  },
  default: {
    color: '#636366',
    bg: 'rgba(99,99,102,0.1)',
    path: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
};

function getFileType(mime, filename) {
  const m = mime || '';
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  if (m.includes('pdf') || ext === 'pdf') return 'pdf';
  if (m.includes('wordprocessingml') || ext === 'docx' || ext === 'docm') return 'word';
  if (m.includes('plain') || m.includes('markdown') || m.includes('rtf') || ['txt', 'md', 'rtf'].includes(ext)) return 'text';
  return 'default';
}

const FileCard = ({ file, onDownload, onDelete, onInfo, isSelected, onSelect, selectionMode }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const fileType = getFileType(file.mime_type, file.filename);
  const icon = FILE_ICONS[fileType];

  const handleDelete = async () => {
    if (!window.confirm('Delete this file permanently?')) return;
    setIsDeleting(true);
    try {
      await onDelete(file.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await onDownload(file.id, file.filename);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCardClick = (e) => {
    if (selectionMode) {
      // In selection mode, clicking the card toggles selection
      e.preventDefault();
      onSelect?.(file.id);
    }
  };

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.selected : ''} ${selectionMode ? styles.selectable : ''}`}
      onClick={handleCardClick}
    >
      {/* Checkbox overlay (visible in selection mode) */}
      {selectionMode && (
        <div
          className={styles.checkboxWrapper}
          onClick={(e) => { e.stopPropagation(); onSelect?.(file.id); }}
        >
          <div className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ''}`}>
            {isSelected && (
              <svg fill="none" viewBox="0 0 24 24" stroke="white" width="12" height="12">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.iconContainer} style={{ background: icon.bg }}>
          <svg fill="none" viewBox="0 0 24 24" stroke={icon.color} width="22" height="22" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon.path} />
          </svg>
        </div>
        <div className={styles.badges}>
          <span className={styles.encryptedBadge}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="10" height="10" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            AES-256
          </span>
        </div>
      </div>

      <div className={styles.content}>
        <h4 className={styles.filename} title={file.filename}>{truncateFilename(file.filename)}</h4>
        <div className={styles.metadata}>
          <span className={styles.size}>{formatFileSize(file.file_size)}</span>
          <span className={styles.dot}>·</span>
          <span className={styles.date}>{formatRelativeTime(file.uploaded_at)}</span>
        </div>
        <div className={styles.hashSection}>
          <HashBadge hash={file.sha256_hash} />
=======
const FileCard = ({ file, onDownload, onDelete }) => {
  const cfg = typeConfig(file.mime_type);

  const handleDelete = () => {
    if (window.confirm('Delete this file permanently?')) onDelete(file.id);
  };

  return (
    <div className="group bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl ${cfg.bg} ring-1 ${cfg.ring} flex items-center justify-center shrink-0`}>
          <span className={cfg.text}>
            <TypeIcon mimeType={file.mime_type} />
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Encrypted
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-white truncate mb-1" title={file.filename}>
          {truncateFilename(file.filename)}
        </h4>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
          <span>{formatFileSize(file.file_size)}</span>
          <span className="w-0.5 h-0.5 rounded-full bg-gray-700 inline-block" />
          <span>{formatRelativeTime(file.uploaded_at)}</span>
>>>>>>> main
        </div>
        <HashBadge hash={file.sha256_hash} />
      </div>

<<<<<<< HEAD
      {!selectionMode && (
        <div className={styles.footer}>
          <button
            className={styles.downloadBtn}
            onClick={handleDownload}
            disabled={isDownloading || isDeleting}
            aria-label="Download file"
          >
            {isDownloading
              ? <span className={styles.spinner} />
              : (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="15" height="15">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )
            }
            {isDownloading ? 'Downloading…' : 'Download'}
          </button>

          <button
            className={styles.infoBtn}
            onClick={() => onInfo?.(file)}
            aria-label="File details"
            title="View details"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="15" height="15">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <button
            className={styles.deleteBtn}
            onClick={handleDelete}
            disabled={isDeleting || isDownloading}
            aria-label="Delete file"
            title="Delete file"
          >
            {isDeleting
              ? <span className={styles.spinner} />
              : (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="15" height="15">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )
            }
          </button>
        </div>
      )}
=======
      {/* Footer actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
        <button
          type="button"
          onClick={() => onDownload(file.id, file.filename)}
          aria-label="Download file"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 text-xs font-semibold text-gray-300 hover:text-white transition-all duration-150"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete file"
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-800/60 hover:bg-red-500/10 border border-gray-700/50 hover:border-red-500/30 text-gray-500 hover:text-red-400 transition-all duration-150 shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
>>>>>>> main
    </div>
  );
};

FileCard.propTypes = {
  file: PropTypes.shape({
    id:          PropTypes.string.isRequired,
    filename:    PropTypes.string.isRequired,
    file_size:   PropTypes.number.isRequired,
    mime_type:   PropTypes.string,
    uploaded_at: PropTypes.string.isRequired,
    sha256_hash: PropTypes.string.isRequired,
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
<<<<<<< HEAD
  onDelete: PropTypes.func.isRequired,
  onInfo: PropTypes.func,
  isSelected: PropTypes.bool,
  onSelect: PropTypes.func,
  selectionMode: PropTypes.bool,
=======
  onDelete:   PropTypes.func.isRequired,
>>>>>>> main
};

export default FileCard;
