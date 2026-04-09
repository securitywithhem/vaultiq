// AI Detection Module — integrated 2026-04-08
import React, { useState } from 'react';
import { detectFiles } from '../api/aiDetectApi';
import styles from './AIDetector.module.css';

export default function AIDetector() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).slice(0, 5);
      setSelectedFiles(filesArray);
      setResults(null);
      setErrorMsg('');
    }
  };

  const handleDetect = async () => {
    if (!selectedFiles.length) return;
    setIsLoading(true);
    setErrorMsg('');
    setResults(null);
    try {
      const data = await detectFiles(selectedFiles);
      setResults(data.results);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderBadge = (verdict) => {
    if (verdict === 'human') return <span className={styles.badgeHuman}>Human</span>;
    if (verdict === 'mixed') return <span className={styles.badgeMixed}>Mixed</span>;
    return <span className={styles.badgeAI}>AI Generated</span>;
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>AI Content Detector</h3>
      <p className={styles.subtitle}>Select up to 5 documents to analyze (.txt, .pdf, .docx)</p>
      
      <input 
        type="file" 
        multiple 
        accept=".txt,.pdf,.docx" 
        onChange={handleFileChange} 
        className={styles.fileInput}
      />
      
      {selectedFiles.length > 0 && (
        <ul className={styles.fileList}>
          {selectedFiles.map((file, idx) => (
            <li key={idx}>{file.name}</li>
          ))}
        </ul>
      )}
      
      <button 
        onClick={handleDetect} 
        disabled={isLoading || selectedFiles.length === 0}
        className={styles.detectBtn}
      >
        {isLoading ? 'Detecting...' : 'Detect AI'}
      </button>

      {errorMsg && (
        <div className={styles.error}>
          {errorMsg}
        </div>
      )}

      {isLoading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>Analyzing documents using Deep Learning models...</span>
        </div>
      )}

      {results && (
        <div className={styles.resultsArea}>
          {results.map((res, i) => (
            <div key={i} className={styles.resultCard}>
              <h4 className={styles.filename}>{res.filename}</h4>
              <p className={styles.score}>
                {res.score !== undefined ? Math.round(res.score * 100) : 0}% AI
              </p>
              
              <div className={styles.metaRow}>
                <span style={{ fontWeight: 600 }}>Verdict:</span> {renderBadge(res.verdict)}
              </div>
              <div className={styles.metaRow}>
                <span style={{ fontWeight: 600 }}>Confidence:</span> {res.confidence}
              </div>
              
              {res.warning && (
                <div className={styles.warning}>
                  Warning: {res.warning}
                </div>
              )}
              
              <div style={{ marginTop: 16 }}>
                <p className={styles.chunkLabel}>Segment Analysis</p>
                <div className={styles.chunkRow}>
                  {res.chunk_scores && res.chunk_scores.map((cs, idx) => (
                    <div 
                      key={idx} 
                      className={styles.chunk}
                      style={{ 
                        background: cs > 0.7 ? '#EF4444' : cs > 0.4 ? '#F59E0B' : '#10B981',
                      }} 
                      title={`Score: ${cs.toFixed(2)}`} 
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
