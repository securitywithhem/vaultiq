import React from 'react';
import Navbar from '../components/Navbar';
import styles from './PlagiarismChecker.module.css';
import AIDetector from '../components/AIDetector';

const PlagiarismChecker = () => {
  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>AI Deep Scan</h1>
          <p className={styles.subtitle}>Upload your documents to detect AI-generated content footprints before encryption.</p>
        </div>

        <div style={{ marginTop: '20px' }}>
          <AIDetector />
        </div>
      </main>
    </div>
  );
};

export default PlagiarismChecker;
