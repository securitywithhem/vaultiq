import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import UploadZone from '../components/UploadZone';
import FileCard from '../components/FileCard';
import EmptyState from '../components/EmptyState';
import { useFiles } from '../hooks/useFiles';
import { fileService } from '../services/fileService';
import useDocumentTitle from '../hooks/useDocumentTitle';
import styles from './Dashboard.module.css';

const Dashboard = () => {
  useDocumentTitle('Dashboard | VaultIQ');
  const { files, isLoading, fetchFiles, addFileOptimistic, deleteFile } = useFiles();

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

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
          ) : files.length === 0 ? (
            <EmptyState 
              message="No files yet." 
              submessage="Upload your first encrypted file above." 
            />
          ) : (
            <div className={styles.grid}>
              {files.map(file => (
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
