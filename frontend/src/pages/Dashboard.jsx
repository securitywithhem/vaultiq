import React, { useEffect, useMemo } from 'react';
import Navbar from '../components/Navbar';
import UploadZone from '../components/UploadZone';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import { useFiles } from '../hooks/useFiles';
import { fileService } from '../services/fileService';

import styles from './Dashboard.module.css';

const Dashboard = () => {

  const { files, isLoading, fetchFiles, addFileOptimistic, deleteFile } = useFiles();

  useEffect(() => {
    const controller = new AbortController();
    fetchFiles(controller.signal);
    return () => controller.abort();
  }, [fetchFiles]);

  const sortedFiles = useMemo(() => 
    [...files].sort((a,b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
  , [files]);

  const handleDownload = async (id, filename) => {
    await fileService.downloadFile(id, filename);
  };

  return (
    <div className={styles.page}>
      <Navbar />
      
      <main className={styles.main}>
        {/* Upload Section */}
        <section className={styles.uploadSection}>
          <UploadZone onUploadSuccess={addFileOptimistic} />
        </section>

        {/* Files Section */}
        <section className={styles.filesSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Your Encrypted Files</h2>
            <div className={styles.badge}>{files.length}</div>
          </div>

          {isLoading ? (
            <div className={styles.grid}>
              {[1, 2, 3].map(i => (
                <div key={i} className={styles.skeletonCard} />
              ))}
            </div>
          ) : sortedFiles.length === 0 ? (
            <EmptyState 
              message="No files yet." 
              submessage="Upload your first encrypted file above." 
            />
          ) : (
            <div className={styles.grid}>
              {sortedFiles.map(file => (
                <FileCard 
                  key={file.id} 
                  file={file} 
                  onDownload={handleDownload}
                  onDelete={deleteFile}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
