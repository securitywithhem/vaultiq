import React, { useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * FileCard — displays a single file with download & delete actions.
 * Props:
 *   file     — { id, filename, file_size, mime_type, uploaded_at, sha256_hash }
 *   onDelete — callback invoked after successful deletion
 */
export default function FileCard({ file, onDelete }) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * Format bytes into a human-readable string.
   * < 1 MB → show in KB (1 decimal), else MB (1 decimal).
   */
  function formatSize(bytes) {
    if (bytes == null) return '—';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Format a date string nicely.
   */
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  /**
   * Get a file-type icon based on mime type.
   */
  function getFileIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return '🗜️';
    if (mimeType.includes('text')) return '📝';
    return '📄';
  }

  /**
   * Download the file as a blob and trigger browser download.
   */
  async function handleDownload() {
    setDownloading(true);
    try {
      const response = await api.get(`/files/${file.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${file.filename}`);
    } catch (err) {
      // TODO: remove in prod
      console.log('Download error:', err);
      toast.error('Failed to download file. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  /**
   * Delete the file and call onDelete callback.
   */
  async function handleDelete() {
    if (!window.confirm(`Delete "${file.filename}"? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      await api.delete(`/files/${file.id}`);
      toast.success(`Deleted ${file.filename}`);
      if (onDelete) onDelete(file.id);
    } catch (err) {
      // TODO: remove in prod
      console.log('Delete error:', err);
      toast.error('Failed to delete file. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="file-card">
      <div className="file-card-header">
        <span className="file-card-icon">{getFileIcon(file.mime_type)}</span>
        <div className="file-card-encrypted" title="Encrypted with AES-256">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="var(--success)" strokeWidth="1.2" />
            <path d="M4.5 6V4.5C4.5 3.11929 5.61929 2 7 2C8.38071 2 9.5 3.11929 9.5 4.5V6" stroke="var(--success)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="file-card-body">
        <h4 className="file-card-name" title={file.filename}>
          {file.filename}
        </h4>
        <div className="file-card-meta">
          <span className="file-card-size">{formatSize(file.file_size)}</span>
          <span className="file-card-dot">·</span>
          <span className="file-card-date">{formatDate(file.uploaded_at)}</span>
        </div>
      </div>

      <div className="file-card-actions">
        <button
          className="btn btn--secondary btn--sm"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <span className="spinner spinner--sm" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2V9.5M7 9.5L4 6.5M7 9.5L10 6.5M2 11.5H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {downloading ? 'Downloading…' : 'Download'}
        </button>
        <button
          className="btn btn--danger btn--sm"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <span className="spinner spinner--sm" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 4H11.5M5 4V2.5H9V4M5.5 6.5V10.5M8.5 6.5V10.5M3.5 4L4 11.5H10L10.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
