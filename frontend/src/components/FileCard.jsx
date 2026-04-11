import React, { useState } from 'react';
import PropTypes from 'prop-types';
import HashBadge from './HashBadge';
import { formatFileSize, formatRelativeTime, truncateFilename } from '../utils/format';
import styles from './FileCard.module.css';

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
        </div>
      </div>

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
    </div>
  );
};

FileCard.propTypes = {
  file: PropTypes.shape({
    id: PropTypes.string.isRequired,
    filename: PropTypes.string.isRequired,
    file_size: PropTypes.number.isRequired,
    mime_type: PropTypes.string,
    uploaded_at: PropTypes.string.isRequired,
    sha256_hash: PropTypes.string.isRequired,
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onInfo: PropTypes.func,
  isSelected: PropTypes.bool,
  onSelect: PropTypes.func,
  selectionMode: PropTypes.bool,
};

export default FileCard;
