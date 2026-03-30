import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import Navbar from '../components/Navbar';
import UploadDropzone from '../components/UploadDropzone';
import FileCard from '../components/FileCard';

export default function Dashboard() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/files');
      setFiles(response.data.files || response.data || []);
    } catch (err) {
      // TODO: remove in prod
      console.log('Fetch files error:', err);
      setError('Failed to load files. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  /**
   * Format bytes into a human-readable string.
   */
  function formatTotalSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0);

  function handleDelete(fileId) {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  return (
    <div className="page-layout">
      <Navbar />
      <main className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-desc">Manage your encrypted files</p>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-icon stat-icon--files">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 3H12L17 8V17H3V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M12 3V8H17" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="stat-info">
              <span className="stat-value">{files.length}</span>
              <span className="stat-label">Files</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon--storage">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="3" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="2" y="12" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="5" cy="5.5" r="1" fill="currentColor" />
                <circle cx="5" cy="14.5" r="1" fill="currentColor" />
              </svg>
            </div>
            <div className="stat-info">
              <span className="stat-value">{formatTotalSize(totalSize)}</span>
              <span className="stat-label">Storage Used</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon--secure">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="9" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 9V6C6 3.79086 7.79086 2 10 2C12.2091 2 14 3.79086 14 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="stat-info">
              <span className="stat-value">AES-256</span>
              <span className="stat-label">Encryption</span>
            </div>
          </div>
        </div>

        {/* Upload Area */}
        <section className="dashboard-section">
          <h2 className="section-title">Upload File</h2>
          <UploadDropzone onSuccess={fetchFiles} />
        </section>

        {/* File Grid */}
        <section className="dashboard-section">
          <h2 className="section-title">
            Your Files
            {!loading && files.length > 0 && (
              <span className="section-count">{files.length}</span>
            )}
          </h2>

          {loading ? (
            <div className="loading-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton skeleton--icon" />
                  <div className="skeleton skeleton--text" />
                  <div className="skeleton skeleton--text-sm" />
                  <div className="skeleton skeleton--actions" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="empty-state">
              <div className="empty-state-icon">⚠️</div>
              <h3>Something went wrong</h3>
              <p>{error}</p>
              <button className="btn btn--primary" onClick={fetchFiles}>
                Retry
              </button>
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="8" y="6" width="32" height="36" rx="3" stroke="var(--border)" strokeWidth="2" />
                  <path d="M16 18H32M16 24H28M16 30H24" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h3>No files yet</h3>
              <p>Upload your first file to get started. All files are encrypted with AES-256.</p>
            </div>
          ) : (
            <div className="file-grid">
              {files.map((file) => (
                <FileCard key={file.id} file={file} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
