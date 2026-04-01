import React from 'react';
import PropTypes from 'prop-types';
import HashBadge from './HashBadge';
import { formatFileSize, formatRelativeTime } from '../utils/formatters';
import styles from './FileCard.module.css';

const FileCard = ({ file, onDownload, onDelete }) => {
  const getFileIcon = () => {
    const type = file.mime_type || '';
    if (type.includes('pdf')) {
      return (
        <svg className={styles.iconRed} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    if (type.includes('image')) {
      return (
        <svg className={styles.iconYellow} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }
    return (
      <svg className={styles.iconBlue} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  };

  const truncateName = (name) => {
    return name.length > 25 ? `${name.substring(0, 22)}...` : name;
  };

  const handleDelete = () => {
    if (window.confirm('Delete this file permanently?')) {
      onDelete(file.id);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.iconContainer}>
          {getFileIcon()}
        </div>
        <div className={styles.secureBadge}>
          <svg className={styles.lockIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Encrypted
        </div>
      </div>

      <div className={styles.content}>
        <h4 className={styles.filename} title={file.filename}>{truncateName(file.filename)}</h4>
        <div className={styles.metadata}>
          <span className={styles.size}>{formatFileSize(file.file_size)}</span>
          <span className={styles.dot}>•</span>
          <span className={styles.date}>{formatRelativeTime(file.uploaded_at)}</span>
        </div>
        
        <div className={styles.hashSection}>
          <HashBadge hash={file.sha256_hash} />
        </div>
      </div>

      <div className={styles.footer}>
        <button 
          className={styles.downloadBtn} 
          onClick={() => onDownload(file.id, file.filename)}
          aria-label="Download file"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
        <button 
          className={styles.deleteBtn} 
          onClick={handleDelete}
          aria-label="Delete file"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
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
    sha256_hash: PropTypes.string.isRequired
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired
};

export default FileCard;
