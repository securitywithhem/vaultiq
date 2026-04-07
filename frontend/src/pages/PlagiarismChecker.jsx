import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import styles from './PlagiarismChecker.module.css';
import { checkPlagiarism } from '../services/plagiarismService';

const PlagiarismChecker = () => {

  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleScan = async () => {
    if (!inputText.trim()) return;
    
    setIsScanning(true);
    setResult(null);
    setError(null);

    try {
      const data = await checkPlagiarism(inputText);

      // AI service returns DetectionResponse: { plagiarism: { score, verdict, matched_segments }, ... }
      const plag = data.plagiarism || {};
      setResult({
        score: Math.round((plag.score || 0) * 100),
        verdict: plag.verdict || 'CLEAN',
        matches: (plag.matched_segments || []).map(m => ({
          url: `Matched Segment: "${(m.text || '').substring(0, 30)}..."`,
          similarity: `${Math.round((m.similarity || 0) * 100)}%`
        }))
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const getScoreColor = (score) => {
    if (score < 15) return styles.scoreSafe;
    if (score < 40) return styles.scoreWarning;
    return styles.scoreDanger;
  };

  return (
    <div className={styles.page}>
      <Navbar />

      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>AI Integrity Search</h1>
          <p className={styles.subtitle}>Check documents against global public records before encrypting.</p>
        </div>

        <div className={styles.scannerInterface}>
          <div className={styles.inputSection}>
            <textarea 
              className={styles.textarea}
              placeholder="Paste text contents here to scan for origin similarities..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <div className={styles.actionRow}>
              <span className={styles.charCount}>{inputText.length} characters</span>
              <button 
                className={styles.scanBtn} 
                onClick={handleScan}
                disabled={isScanning || !inputText.trim()}
              >
                {isScanning ? 'Analyzing Vectors...' : 'Run Deep Scan'}
              </button>
            </div>
          </div>

          <div className={styles.resultSection}>
            {isScanning ? (
              <div className={styles.scanningState}>
                <div className={styles.radarContainer}>
                  <div className={styles.radarSweep}></div>
                </div>
                <LoadingSpinner size="md" text="Cross-referencing global databases..." />
              </div>
            ) : result ? (
              <div className={styles.reportContainer}>
                <div className={styles.scoreCircle}>
                  <div className={`${styles.scoreValue} ${getScoreColor(result.score)}`}>
                    {result.score}%
                  </div>
                  <span className={styles.scoreLabel}>Similarity</span>
                </div>

                <div className={styles.matchesList}>
                  <h3>Detected Origins</h3>
                  {result.matches.map((match, i) => (
                    <div key={i} className={styles.matchItem}>
                      <span className={styles.matchUrl}>{match.url}</span>
                      <span className={styles.matchPercent}>{match.similarity} match</span>
                    </div>
                  ))}
                  {result.matches.length === 0 && (
                    <p className={styles.noMatches}>Clear! No significant similarities found.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.emptyReport}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>Awaiting text input for analysis...</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PlagiarismChecker;
