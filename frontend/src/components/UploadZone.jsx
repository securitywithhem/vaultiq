import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useDropzone } from 'react-dropzone';
import { fileService } from '../services/fileService';
import toast from 'react-hot-toast';
import { formatFileSize } from '../utils/format';
import styles from './UploadZone.module.css';

const UploadZone = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles?.length > 0) {
      setFile(acceptedFiles[0]);
      setIsComplete(false);
      setProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false
  });

  const handleUpload = async (e) => {
    e.stopPropagation();
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadedFile = await fileService.uploadFile(file, (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setProgress(percentCompleted);
      });
      
      setIsComplete(true);
      toast.success('File encrypted and uploaded safely');
      
      if (onUploadSuccess) {
        onUploadSuccess(uploadedFile);
      }
      
      // Reset after 3 seconds
      setTimeout(() => {
        setFile(null);
        setIsComplete(false);
        setProgress(0);
      }, 3000);
      
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };


  const cancelSelection = (e) => {
    e.stopPropagation();
    setFile(null);
  };

  return (
    <div 
      {...getRootProps()} 
      className={`${styles.container} ${isDragActive ? styles.dragActive : ''} ${isComplete ? styles.complete : ''}`}
    >
      <input {...getInputProps()} />
      
      {!file ? (
        <div className={styles.emptyState}>
          <div className={`${styles.iconWrapper} ${isDragActive ? styles.iconPulse : ''}`}>
            <svg className={styles.uploadIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className={styles.title}>
            {isDragActive ? 'Release to encrypt and upload' : 'Drop files here or click to browse'}
          </p>
          <p className={styles.subtitle}>All files will be encrypted with AES-256 before leaving your device.</p>
        </div>
      ) : (
        <div className={styles.fileState}>
          <div className={styles.fileInfo}>
            <div className={styles.fileIcon}>
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className={styles.fileDetails}>
              <p className={styles.fileName}>{file.name}</p>
              <p className={styles.fileSize}>{formatFileSize(file.size)}</p>
            </div>
          </div>
          
          {isUploading && (
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }}></div>
              </div>
              <span className={styles.progressText}>{progress}% Encrypting...</span>
            </div>
          )}

          {isComplete && (
            <div className={styles.successState}>
              <svg className={styles.successIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Encrypted & Uploaded</span>
            </div>
          )}

          {!isUploading && !isComplete && (
            <div className={styles.actions}>
              <button 
                className={styles.cancelBtn} 
                onClick={cancelSelection}
                type="button"
              >
                Cancel
              </button>
              <button 
                className={styles.uploadBtn} 
                onClick={handleUpload}
                type="button"
              >
                Secure Upload
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

UploadZone.propTypes = {
  onUploadSuccess: PropTypes.func
};

export default UploadZone;
