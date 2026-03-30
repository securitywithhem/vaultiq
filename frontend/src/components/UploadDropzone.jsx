import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * UploadDropzone — drag-and-drop file upload area.
 * Props:
 *   onSuccess — callback invoked after a successful upload (to refresh file list)
 */
export default function UploadDropzone({ onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');

  const onDrop = useCallback(
    async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      setFileName(file.name);
      setUploading(true);
      setProgress(0);

      const formData = new FormData();
      formData.append('file', file);

      try {
        await api.post('/files/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const pct = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setProgress(pct);
          },
        });
        toast.success('File uploaded successfully');
        if (onSuccess) onSuccess();
      } catch (err) {
        // TODO: remove in prod
        console.log('Upload error:', err);
        const message =
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Upload failed. Please try again.';
        toast.error(message);
      } finally {
        setUploading(false);
        setProgress(0);
        setFileName('');
      }
    },
    [onSuccess]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`upload-dropzone ${isDragActive ? 'upload-dropzone--active' : ''} ${
        uploading ? 'upload-dropzone--uploading' : ''
      }`}
    >
      <input {...getInputProps()} />

      {uploading ? (
        <div className="upload-progress">
          <div className="upload-progress-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 4V20M16 4L10 10M16 4L22 10"
                stroke="var(--primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 22V26C4 27.1046 4.89543 28 6 28H26C27.1046 28 28 27.1046 28 26V22"
                stroke="var(--primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="upload-progress-name">{fileName}</p>
          <div className="upload-progress-bar-track">
            <div
              className="upload-progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="upload-progress-pct">{progress}%</p>
        </div>
      ) : (
        <div className="upload-prompt">
          <div className="upload-prompt-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="19" stroke="var(--border)" strokeWidth="2" strokeDasharray="4 3" />
              <path
                d="M20 12V24M20 12L14 18M20 12L26 18"
                stroke={isDragActive ? 'var(--primary)' : 'var(--text-muted)'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="upload-prompt-text">
            {isDragActive
              ? 'Drop your file here…'
              : 'Drag & drop a file here, or click to browse'}
          </p>
          <p className="upload-prompt-hint">All file types accepted · Encrypted on upload</p>
        </div>
      )}
    </div>
  );
}
