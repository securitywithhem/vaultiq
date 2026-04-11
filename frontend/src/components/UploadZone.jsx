import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useDropzone } from 'react-dropzone';
import { fileService } from '../services/fileService';
import toast from 'react-hot-toast';
import { formatFileSize } from '../utils/format';
import styles from './UploadZone.module.css';

const UploadZone = ({ onUploadSuccess }) => {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState({}); // { filename: percent }
  const [done, setDone] = useState(false);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles?.length > 0) {
      setFiles(acceptedFiles);
      setDone(false);
      setProgress({});
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const handleUpload = async (e) => {
    e.stopPropagation();
    if (!files.length) return;

    setIsUploading(true);
    let anySuccess = false;

    for (const file of files) {
      try {
        const uploaded = await fileService.uploadFile(file, (ev) => {
          const pct = Math.round((ev.loaded * 100) / ev.total);
          setProgress(prev => ({ ...prev, [file.name]: pct }));
        });
        if (onUploadSuccess) onUploadSuccess(uploaded);
        anySuccess = true;
      } catch (err) {
        const msg = err.response?.data?.error || `Upload failed: ${file.name}`;
        toast.error(msg);
      }
    }

    setIsUploading(false);
    if (anySuccess) {
      setDone(true);
      toast.success(`${files.length === 1 ? 'File' : `${files.length} files`} encrypted and uploaded`);
      setTimeout(() => {
        setFiles([]);
        setDone(false);
        setProgress({});
      }, 3000);
    }
  };

  const cancelSelection = (e) => {
    e.stopPropagation();
    setFiles([]);
  };

  const overallProgress = files.length
    ? Math.round(Object.values(progress).reduce((a, b) => a + b, 0) / files.length)
    : 0;

  return (
    <div
      {...getRootProps()}
      className={`${styles.container} ${isDragActive ? styles.dragActive : ''} ${done ? styles.complete : ''}`}
    >
      <input {...getInputProps()} />

      {!files.length ? (
        <div className={styles.emptyState}>
          <div className={`${styles.iconWrapper} ${isDragActive ? styles.iconPulse : ''}`}>
            <svg className={styles.uploadIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className={styles.title}>
            {isDragActive ? 'Release to encrypt and upload' : 'Drop files here or click to browse'}
          </p>
          <p className={styles.subtitle}>
            All files will be encrypted with AES-256. You can select multiple files at once.
          </p>
        </div>
      ) : (
        <div className={styles.fileState}>
          <ul className={styles.fileList}>
            {files.map((f) => (
              <li key={f.name} className={styles.fileRow}>
                <div className={styles.fileIcon}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className={styles.fileDetails}>
                  <p className={styles.fileName}>{f.name}</p>
                  <p className={styles.fileSize}>{formatFileSize(f.size)}</p>
                </div>
                {isUploading && progress[f.name] !== undefined && (
                  <span className={styles.filePct}>{progress[f.name]}%</span>
                )}
                {done && (
                  <svg className={styles.checkIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </li>
            ))}
          </ul>

          {isUploading && (
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${overallProgress}%` }} />
              </div>
              <span className={styles.progressText}>{overallProgress}% Encrypting…</span>
            </div>
          )}

          {done && (
            <div className={styles.successState}>
              <svg className={styles.successIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Encrypted &amp; Uploaded</span>
            </div>
          )}

          {!isUploading && !done && (
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={cancelSelection} type="button">
                Cancel
              </button>
              <button className={styles.uploadBtn} onClick={handleUpload} type="button">
                Secure Upload ({files.length} {files.length === 1 ? 'file' : 'files'})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

UploadZone.propTypes = {
  onUploadSuccess: PropTypes.func,
};

export default UploadZone;
