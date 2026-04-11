// AI Detection Module
import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { detectFiles, detectVaultFiles, fetchAIHistory } from '../api/aiDetectApi';
import { fileService } from '../services/fileService';
import styles from './AIDetector.module.css';

export default function AIDetector() {
  const [mode, setMode] = useState('upload');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [vaultFiles, setVaultFiles] = useState([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultSearch, setVaultSearch] = useState('');
  const [selectedVaultIds, setSelectedVaultIds] = useState([]);
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [modelWarning, setModelWarning] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Dropzone ──────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted) => {
    setSelectedFiles(accepted.slice(0, 5));
    setResults(null);
    setErrorMsg('');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'text/plain': [],
    },
    multiple: true,
    maxFiles: 5,
  });

  // ── Load vault files ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'vault') return;
    setVaultLoading(true);
    fileService.getFiles(0)
      .then(data => setVaultFiles(data.files || []))
      .catch(() => setVaultFiles([]))
      .finally(() => setVaultLoading(false));
  }, [mode]);

  // ── Load history ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'history') return;
    setHistoryLoading(true);
    fetchAIHistory()
      .then(data => setHistory(data))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [mode]);

  const filteredVault = vaultFiles.filter(f =>
    f.filename.toLowerCase().includes(vaultSearch.toLowerCase())
  );

  const toggleVaultFile = (id) => {
    setSelectedVaultIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 5 ? [...prev, id] : prev
    );
  };

  // ── Run detection ─────────────────────────────────────────────────────────
  const handleDetect = async () => {
    setIsLoading(true);
    setErrorMsg('');
    setResults(null);
    setModelWarning(null);
    try {
      let data;
      if (mode === 'upload') {
        if (!selectedFiles.length) return;
        data = await detectFiles(selectedFiles);
      } else {
        if (!selectedVaultIds.length) return;
        data = await detectVaultFiles(selectedVaultIds);
      }
      setResults(data.results);
      setModelWarning(data.model_warning || null);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const canDetect = mode === 'upload' ? selectedFiles.length > 0 : selectedVaultIds.length > 0;

  // ── Score gauge ───────────────────────────────────────────────────────────
  const ScoreGauge = ({ score }) => {
    const pct = Math.round((score || 0) * 100);
    const color = pct >= 70 ? '#ff453a' : pct >= 40 ? '#ff9f0a' : '#30d158';
    const r = 38;
    const circ = 2 * Math.PI * r;
    const filled = circ * (pct / 100);
    return (
      <div className={styles.gaugeWrap}>
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#2c2c2e" strokeWidth="9" />
          <circle
            cx="48" cy="48" r={r} fill="none"
            stroke={color} strokeWidth="9"
            strokeDasharray={`${filled} ${circ}`}
            strokeDashoffset={circ * 0.25}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
          <text x="48" y="46" textAnchor="middle" dominantBaseline="middle"
            fill={color} fontSize="17" fontWeight="700"
          >{pct}%</text>
          <text x="48" y="60" textAnchor="middle" dominantBaseline="middle"
            fill="#636366" fontSize="8" fontWeight="600"
          >AI SCORE</text>
        </svg>
      </div>
    );
  };

  // ── Verdict badge ─────────────────────────────────────────────────────────
  const renderBadge = (verdict) => {
    if (verdict === 'human') return <span className={styles.badgeHuman}>Human</span>;
    if (verdict === 'mixed') return <span className={styles.badgeMixed}>Mixed</span>;
    return <span className={styles.badgeAI}>AI Generated</span>;
  };

  const hasResults = results && results.length > 0;

  return (
    <div className={styles.container}>
      <div className={hasResults ? styles.layoutWithResults : styles.layout}>

        {/* ── LEFT: Input panel ──────────────────────────────────── */}
        <div className={styles.inputPanel}>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${mode === 'upload' ? styles.tabActive : ''}`}
              onClick={() => { setMode('upload'); setResults(null); setErrorMsg(''); }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Files
            </button>
            <button
              className={`${styles.tab} ${mode === 'vault' ? styles.tabActive : ''}`}
              onClick={() => { setMode('vault'); setResults(null); setErrorMsg(''); }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              From Vault
            </button>
            <button
              className={`${styles.tab} ${mode === 'history' ? styles.tabActive : ''}`}
              onClick={() => { setMode('history'); setResults(null); setErrorMsg(''); }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </button>
          </div>

          {/* Upload mode */}
          {mode === 'upload' && (
            <>
              <div
                {...getRootProps()}
                className={`${styles.dropzone} ${isDragActive ? styles.dropzoneActive : ''}`}
              >
                <input {...getInputProps()} />
                <div className={styles.dropzoneInner}>
                  <div className={styles.dropzoneIcon}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className={styles.dropzoneTitle}>
                    {isDragActive ? 'Drop files here' : 'Click to select documents'}
                  </p>
                  <p className={styles.dropzoneSub}>Supports .txt, .pdf, .docx — up to 5 files at once</p>
                </div>
              </div>

              {selectedFiles.length > 0 && (
                <ul className={styles.fileList}>
                  {selectedFiles.map((f, i) => (
                    <li key={i} className={styles.fileItem}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* Vault mode */}
          {mode === 'vault' && (
            <div className={styles.vaultPanel}>
              <p className={styles.vaultHint}>Select up to 5 files from your encrypted vault to scan.</p>
              <div className={styles.vaultSearch}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search vault files…"
                  value={vaultSearch}
                  onChange={e => setVaultSearch(e.target.value)}
                  className={styles.vaultSearchInput}
                />
              </div>

              {vaultLoading ? (
                <p className={styles.vaultEmpty}>Loading vault files…</p>
              ) : filteredVault.length === 0 ? (
                <p className={styles.vaultEmpty}>
                  {vaultSearch ? 'No files match your search.' : 'No files in vault yet.'}
                </p>
              ) : (
                <ul className={styles.vaultList}>
                  {filteredVault.map(f => {
                    const checked = selectedVaultIds.includes(f.id);
                    const disabled = !checked && selectedVaultIds.length >= 5;
                    return (
                      <li
                        key={f.id}
                        className={`${styles.vaultItem} ${checked ? styles.vaultItemSelected : ''} ${disabled ? styles.vaultItemDisabled : ''}`}
                        onClick={() => !disabled && toggleVaultFile(f.id)}
                      >
                        <input type="checkbox" checked={checked} readOnly disabled={disabled} className={styles.vaultCheck} />
                        <span className={styles.vaultName}>{f.filename}</span>
                        <span className={styles.vaultMeta}>
                          {f.mime_type?.split('/').pop()?.toUpperCase() || 'FILE'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selectedVaultIds.length > 0 && (
                <p className={styles.vaultSelected}>{selectedVaultIds.length} file{selectedVaultIds.length > 1 ? 's' : ''} selected</p>
              )}
            </div>
          )}

          {/* History mode */}
          {mode === 'history' && (
            <div className={styles.historyPanel}>
              {historyLoading ? (
                <p className={styles.vaultEmpty}>Loading history…</p>
              ) : history.length === 0 ? (
                <p className={styles.vaultEmpty}>No detection history yet. Run a scan to see results here.</p>
              ) : (
                <ul className={styles.historyList}>
                  {history.map((item, i) => {
                    const pct = Math.round((item.score || 0) * 100);
                    const color = pct >= 70 ? 'var(--accent-red)' : pct >= 40 ? 'var(--accent-amber)' : 'var(--accent-green)';
                    return (
                      <li key={i} className={styles.historyItem}>
                        <div className={styles.historyName}>{item.filename}</div>
                        <div className={styles.historyMeta}>
                          <span className={styles.historyDate}>
                            {item.timestamp ? new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </span>
                          <span style={{ color, fontWeight: 600, fontSize: '0.8rem' }}>{pct}% AI</span>
                          {item.verdict === 'human' && <span className={styles.badgeHuman}>Human</span>}
                          {item.verdict === 'mixed' && <span className={styles.badgeMixed}>Mixed</span>}
                          {item.verdict === 'ai_generated' && <span className={styles.badgeAI}>AI</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Detect button */}
          <button onClick={handleDetect} disabled={isLoading || !canDetect || mode === 'history'} className={styles.detectBtn}
            style={mode === 'history' ? { display: 'none' } : {}}
          >
            {isLoading
              ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <span className={styles.spinner} />
                  Running analysis…
                </span>
              : 'Detect AI Content'}
          </button>

          {/* Error */}
          {errorMsg && mode !== 'history' && <div className={styles.error}>{errorMsg}</div>}

          {/* Model warning */}
          {modelWarning && mode !== 'history' && (
            <div className={styles.modelWarning} role="alert">
              ⚠ Detection running in reduced accuracy mode. The LR model is unavailable.
            </div>
          )}

          {/* How it works */}
          {!results && !isLoading && mode !== 'history' && (
            <div className={styles.howItWorks}>
              <p className={styles.howTitle}>How it works</p>
              <p className={styles.howBody}>
                Our deep learning models (RoBERTa + GPT-2 perplexity + statistical LR ensemble) analyse your
                documents in segments, scoring each section for AI-generated patterns.
                Results show a per-file verdict with confidence level and a visual segment heatmap.
              </p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Results panel ──────────────────────────────── */}
        {hasResults && (
          <div className={styles.resultsPanel}>
            <p className={styles.resultsPanelTitle}>
              {results.length} file{results.length > 1 ? 's' : ''} analysed
            </p>
            <div className={styles.resultsArea}>
              {results.map((res, i) => (
                <div key={i} className={styles.resultCard}>
                  <h4 className={styles.filename}>{res.filename}</h4>

                  {res.status === 'error' ? (
                    <div className={styles.warning}>⚠ {res.error}</div>
                  ) : (
                    <>
                      <div className={styles.scoreRow}>
                        <ScoreGauge score={res.score} />
                        <div className={styles.scoreMeta}>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>Verdict</span>
                            {renderBadge(res.verdict)}
                          </div>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>Confidence</span>
                            <span className={`${styles.confidencePill} ${styles['confidence_' + res.confidence]}`}>
                              {res.confidence}
                            </span>
                          </div>
                          {res.similarity_score !== undefined && (
                            <div className={styles.metaRow}>
                              <span className={styles.metaLabel}>Similarity</span>
                              <span className={styles.metaVal}>{Math.round(res.similarity_score * 100)}%</span>
                            </div>
                          )}
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>Segments</span>
                            <span className={styles.metaVal}>{res.chunks_count ?? res.chunk_scores?.length ?? '—'}</span>
                          </div>
                        </div>
                      </div>

                      {res.warning && <div className={styles.warning}>⚠ {res.warning}</div>}

                      {res.chunk_scores && res.chunk_scores.length > 0 && (
                        <div className={styles.chunkSection}>
                          <p className={styles.chunkLabel}>Segment Heatmap</p>
                          <div className={styles.chunkRow}>
                            {res.chunk_scores.map((cs, idx) => (
                              <div
                                key={idx}
                                className={styles.chunk}
                                style={{ background: cs > 0.7 ? '#ff453a' : cs > 0.4 ? '#ff9f0a' : '#30d158' }}
                                title={`Segment ${idx + 1}: ${Math.round(cs * 100)}% AI`}
                              />
                            ))}
                          </div>
                          <div className={styles.chunkLegend}>
                            <span style={{ color: '#30d158' }}>■ Human</span>
                            <span style={{ color: '#ff9f0a' }}>■ Mixed</span>
                            <span style={{ color: '#ff453a' }}>■ AI</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
