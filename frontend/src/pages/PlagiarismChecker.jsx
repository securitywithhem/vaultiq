import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';

const AI_BASE = 'http://localhost:8001';

export default function PlagiarismChecker() {
  const [file, setFile] = useState(null);
  const [checking, setChecking] = useState(false);
  const [training, setTraining] = useState(false);
  const [results, setResults] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setResults(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
  });

  async function handleCheck() {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    setChecking(true);
    setResults(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${AI_BASE}/check`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResults(response.data);
    } catch (err) {
      // TODO: remove in prod
      console.log('Plagiarism check error:', err);
      toast.error(
        'Plagiarism check failed. Make sure the AI service is running.'
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleTrain() {
    setTraining(true);
    try {
      const response = await axios.post(`${AI_BASE}/train`);
      toast.success(
        `Model trained successfully! Corpus size: ${response.data.corpus_size || 'N/A'}`
      );
    } catch (err) {
      // TODO: remove in prod
      console.log('Train error:', err);
      toast.error('Training failed. Make sure the AI service is running.');
    } finally {
      setTraining(false);
    }
  }

  function getScoreColor(score) {
    const pct = score * 100;
    if (pct >= 80) return 'var(--danger)';
    if (pct >= 50) return 'var(--warning)';
    return 'var(--success)';
  }

  function getScoreBadgeClass(score) {
    const pct = score * 100;
    if (pct >= 80) return 'score-badge--high';
    if (pct >= 50) return 'score-badge--moderate';
    return 'score-badge--low';
  }

  function formatScore(score) {
    return `${(score * 100).toFixed(1)}%`;
  }

  const sortedMatches = results?.matches
    ? [...results.matches].sort((a, b) => b.final_score - a.final_score)
    : [];

  return (
    <div className="page-layout">
      <Navbar />
      <main className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Plagiarism Checker</h1>
            <p className="page-desc">
              AI-powered document similarity analysis
            </p>
          </div>
          <button
            className="btn btn--secondary"
            onClick={handleTrain}
            disabled={training}
          >
            {training ? (
              <>
                <span className="spinner" />
                Training…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 5V8L10 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Train Model
              </>
            )}
          </button>
        </div>

        <div className="plagiarism-layout">
          {/* Left Panel — File Upload */}
          <div className="plagiarism-panel plagiarism-panel--upload">
            <h3 className="panel-title">Upload Document</h3>
            <div
              {...getRootProps()}
              className={`plag-dropzone ${isDragActive ? 'plag-dropzone--active' : ''}`}
            >
              <input {...getInputProps()} />
              <div className="plag-dropzone-content">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <circle
                    cx="18"
                    cy="18"
                    r="17"
                    stroke="var(--border)"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                  <path
                    d="M18 10V22M18 10L12 16M18 10L24 16"
                    stroke={isDragActive ? 'var(--primary)' : 'var(--text-muted)'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p>
                  {isDragActive
                    ? 'Drop your document here…'
                    : 'Drag & drop a document'}
                </p>
                <span className="plag-dropzone-hint">
                  PDF, DOCX, or TXT only
                </span>
              </div>
            </div>

            {file && (
              <div className="plag-selected-file">
                <div className="plag-file-icon">📄</div>
                <div className="plag-file-info">
                  <span className="plag-file-name">{file.name}</span>
                  <span className="plag-file-size">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  className="btn btn--icon"
                  onClick={() => {
                    setFile(null);
                    setResults(null);
                  }}
                  title="Remove file"
                >
                  ✕
                </button>
              </div>
            )}

            <button
              className="btn btn--primary btn--full"
              onClick={handleCheck}
              disabled={!file || checking}
              style={{ marginTop: '16px' }}
            >
              {checking ? (
                <>
                  <span className="spinner" />
                  Analyzing…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Check for Plagiarism
                </>
              )}
            </button>
          </div>

          {/* Right Panel — Results */}
          <div className="plagiarism-panel plagiarism-panel--results">
            <h3 className="panel-title">Results</h3>

            {checking ? (
              <div className="plag-loading">
                <div className="plag-loading-spinner" />
                <p>Analyzing document similarity…</p>
                <span className="text-muted">This may take a moment</span>
              </div>
            ) : results ? (
              <>
                {/* Summary */}
                {results.summary && (
                  <div className="plag-summary">
                    <div className="plag-summary-stat">
                      <span className="plag-summary-value">
                        {results.summary.total_docs}
                      </span>
                      <span className="plag-summary-label">
                        Documents Compared
                      </span>
                    </div>
                    <div className="plag-summary-stat plag-summary-stat--high">
                      <span className="plag-summary-value">
                        {results.summary.high_similarity}
                      </span>
                      <span className="plag-summary-label">High Similarity</span>
                    </div>
                    <div className="plag-summary-stat plag-summary-stat--mod">
                      <span className="plag-summary-value">
                        {results.summary.moderate}
                      </span>
                      <span className="plag-summary-label">Moderate</span>
                    </div>
                    <div className="plag-summary-stat plag-summary-stat--low">
                      <span className="plag-summary-value">
                        {results.summary.low}
                      </span>
                      <span className="plag-summary-label">Low</span>
                    </div>
                  </div>
                )}

                {/* Matches List */}
                {sortedMatches.length > 0 ? (
                  <div className="plag-matches">
                    {sortedMatches.map((match, i) => (
                      <div className="plag-match" key={i}>
                        <div
                          className="plag-match-header"
                          onClick={() =>
                            setExpandedIdx(expandedIdx === i ? null : i)
                          }
                        >
                          <div className="plag-match-left">
                            <span className="plag-match-name">
                              {match.filename}
                            </span>
                          </div>
                          <div className="plag-match-right">
                            <span
                              className={`score-badge ${getScoreBadgeClass(
                                match.final_score
                              )}`}
                            >
                              {formatScore(match.final_score)}
                            </span>
                            <span
                              className={`plag-match-chevron ${
                                expandedIdx === i ? 'plag-match-chevron--open' : ''
                              }`}
                            >
                              ▾
                            </span>
                          </div>
                        </div>

                        {expandedIdx === i && (
                          <div className="plag-match-detail">
                            <div className="plag-score-row">
                              <span className="plag-score-label">
                                Word2Vec Score
                              </span>
                              <div className="plag-score-bar-track">
                                <div
                                  className="plag-score-bar-fill"
                                  style={{
                                    width: `${match.word2vec_score * 100}%`,
                                    backgroundColor: getScoreColor(
                                      match.word2vec_score
                                    ),
                                  }}
                                />
                              </div>
                              <span className="plag-score-value">
                                {formatScore(match.word2vec_score)}
                              </span>
                            </div>
                            <div className="plag-score-row">
                              <span className="plag-score-label">
                                TF-IDF Score
                              </span>
                              <div className="plag-score-bar-track">
                                <div
                                  className="plag-score-bar-fill"
                                  style={{
                                    width: `${match.tfidf_score * 100}%`,
                                    backgroundColor: getScoreColor(
                                      match.tfidf_score
                                    ),
                                  }}
                                />
                              </div>
                              <span className="plag-score-value">
                                {formatScore(match.tfidf_score)}
                              </span>
                            </div>
                            <div className="plag-score-row">
                              <span className="plag-score-label">
                                Jaccard Score
                              </span>
                              <div className="plag-score-bar-track">
                                <div
                                  className="plag-score-bar-fill"
                                  style={{
                                    width: `${match.jaccard_score * 100}%`,
                                    backgroundColor: getScoreColor(
                                      match.jaccard_score
                                    ),
                                  }}
                                />
                              </div>
                              <span className="plag-score-value">
                                {formatScore(match.jaccard_score)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="plag-no-matches">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="14" stroke="var(--success)" strokeWidth="1.5" />
                      <path d="M10 16L14 20L22 12" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p>No similar documents found</p>
                  </div>
                )}
              </>
            ) : (
              <div className="plag-empty">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="20" cy="20" r="14" stroke="var(--border)" strokeWidth="2" />
                  <path d="M30 30L42 42" stroke="var(--border)" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <h4>No analysis yet</h4>
                <p>Upload a document and click "Check for Plagiarism" to begin</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
