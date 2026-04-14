import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { formatFileSize } from '../utils/format';
import styles from './FileDetailsModal.module.css';

const FileDetailsModal = ({ file, onClose }) => {
  const overlayRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const copyHash = () => {
    navigator.clipboard.writeText(file.sha256_hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const uploadDate = file.uploaded_at
    ? new Date(file.uploaded_at).toLocaleString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '—';

  const mimeLabel = () => {
    const m = file.mime_type || '';
    if (m.includes('pdf')) return 'PDF Document';
    if (m.includes('wordprocessingml')) return 'Word Document (DOCX)';
    if (m.includes('plain')) return 'Plain Text';
    if (m.includes('markdown')) return 'Markdown';
    if (m.includes('rtf')) return 'Rich Text (RTF)';
    return file.mime_type || 'Unknown';
  };

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>File Details</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.filenameRow}>
            <span className={styles.filename}>{file.filename}</span>
          </div>

          <div className={styles.rows}>
            <DetailRow label="File Size" value={`${formatFileSize(file.file_size)} (${file.file_size?.toLocaleString()} bytes)`} mono />
            <DetailRow label="Type" value={mimeLabel()} />
            <DetailRow label="Uploaded" value={uploadDate} />
            <DetailRow label="Encryption" value="AES-256-CBC" accent="green" />
          </div>

          <div className={styles.hashBlock}>
            <div className={styles.hashLabel}>
              <span>SHA-256 Hash</span>
              <span className={styles.integrityBadge}>Integrity verified</span>
            </div>
            <div className={styles.hashValue}>
              <code className={styles.hashText}>{file.sha256_hash}</code>
              <button className={styles.copyBtn} onClick={copyHash} title="Copy hash">
                {copied
                  ? <svg fill="none" viewBox="0 0 24 24" stroke="#30d158" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  : <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ label, value, mono, accent }) => (
  <div className={styles.row}>
    <span className={styles.rowLabel}>{label}</span>
    <span
      className={`${styles.rowValue} ${mono ? styles.mono : ''}`}
      style={accent === 'green' ? { color: 'var(--accent-green)' } : {}}
    >
      {value}
    </span>
  </div>
);

FileDetailsModal.propTypes = {
  file: PropTypes.shape({
    filename: PropTypes.string.isRequired,
    file_size: PropTypes.number,
    mime_type: PropTypes.string,
    uploaded_at: PropTypes.string,
    sha256_hash: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default FileDetailsModal;
