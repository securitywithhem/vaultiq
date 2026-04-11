import React from 'react';
import Navbar from '../components/Navbar';
import styles from './TextAiDetection.module.css';
import AIDetector from '../components/AIDetector';

const TextAiDetection = () => {
  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>AI Deep Scan</h1>
            <p className={styles.subtitle}>
              Detect AI-generated content in your documents using RoBERTa + statistical ensemble models.
            </p>
          </div>
          <div className={styles.modelPills}>
            <span className={styles.pill}>RoBERTa</span>
            <span className={styles.pill}>GPT-2 Perplexity</span>
            <span className={styles.pill}>Statistical LR</span>
          </div>
        </div>

        {/* ── Full-width detector ── */}
        <AIDetector />
      </main>
    </div>
  );
};

export default TextAiDetection;
