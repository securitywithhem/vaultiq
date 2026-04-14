// AI Detection Module
<<<<<<< HEAD
import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { detectFiles, detectVaultFiles, fetchAIHistory } from '../api/aiDetectApi';
import { fileService } from '../services/fileService';
import styles from './AIDetector.module.css';
=======
import React, { useState, useRef } from 'react';
import { detectFiles } from '../api/aiDetectApi';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPT   = '.txt,.pdf,.docx';
const MAX_FILES = 5;

// ─── Sub-components ───────────────────────────────────────────────────────────

const VerdictBadge = ({ verdict }) => {
  const cfg = {
    human: { label: 'Human Written', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
    mixed: { label: 'Mixed Content', bg: 'bg-amber-500/10  border-amber-500/20  text-amber-400'  },
  }[verdict] ?? { label: 'AI Generated', bg: 'bg-red-500/10 border-red-500/20 text-red-400' };

  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
};

const ScoreBar = ({ score }) => {
  const pct   = Math.round((score ?? 0) * 100);
  const color = pct > 70 ? 'bg-red-500' : pct > 40 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500">AI probability</span>
        <span className="text-xs font-mono font-semibold text-white">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const ChunkMap = ({ chunks }) => {
  if (!chunks?.length) return null;
  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">Segment analysis</p>
      <div className="flex gap-0.5 flex-wrap">
        {chunks.map((score, i) => {
          const bg = score > 0.7 ? 'bg-red-500' : score > 0.4 ? 'bg-amber-400' : 'bg-emerald-500';
          return (
            <div
              key={i}
              title={`Segment ${i + 1}: ${Math.round(score * 100)}% AI`}
              className={`h-3 w-3 rounded-sm ${bg} opacity-80 hover:opacity-100 transition-opacity`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2">
        {[['bg-emerald-500', 'Human'], ['bg-amber-400', 'Mixed'], ['bg-red-500', 'AI']].map(([cls, lbl]) => (
          <div key={lbl} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-sm ${cls} opacity-80`} />
            <span className="text-[10px] text-gray-600">{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── AIDetector ───────────────────────────────────────────────────────────────
>>>>>>> main

export default function AIDetector() {
  const [mode, setMode] = useState('upload');
  const [selectedFiles, setSelectedFiles] = useState([]);
<<<<<<< HEAD
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
=======
  const [results,       setResults]       = useState(null);
  const [isLoading,     setIsLoading]     = useState(false);
  const [errorMsg,      setErrorMsg]      = useState('');
  const [modelWarning,  setModelWarning]  = useState(null); // degraded-accuracy banner
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    if (!e.target.files) return;
    setSelectedFiles(Array.from(e.target.files).slice(0, MAX_FILES));
    setResults(null);
    setErrorMsg('');
>>>>>>> main
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

<<<<<<< HEAD
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
=======
  const handleReset = () => {
    setSelectedFiles([]);
    setResults(null);
    setErrorMsg('');
    setModelWarning(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // ── Idle / file-picker state ──────────────────────────────────────────────
  if (!selectedFiles.length && !results && !isLoading) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="
            w-full flex flex-col items-center justify-center gap-4
            border-2 border-dashed border-gray-800 hover:border-emerald-500/40
            bg-gray-900/50 hover:bg-emerald-500/[0.03]
            rounded-2xl py-16 px-6
            transition-all duration-200 group
          "
        >
          <div className="w-12 h-12 rounded-2xl bg-gray-800 group-hover:bg-emerald-500/10 flex items-center justify-center transition-colors duration-200">
            <svg className="w-5 h-5 text-gray-500 group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white mb-1">Click to select documents</p>
            <p className="text-xs text-gray-500">Supports .txt, .pdf, .docx — up to {MAX_FILES} files at once</p>
          </div>
        </button>

        <input ref={inputRef} type="file" multiple accept={ACCEPT} onChange={handleFileChange} className="sr-only" />

        <div className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-white mb-0.5">How it works</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Our deep learning models analyse your documents in segments, scoring each section for AI-generated patterns. Results show a per-file verdict with confidence level and a visual segment heatmap.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Files selected — ready to scan ───────────────────────────────────────
  if (selectedFiles.length && !isLoading && !results) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-white">
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
            </p>
            <button type="button" onClick={handleReset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Clear
            </button>
          </div>
          <ul className="space-y-2">
            {selectedFiles.map((file, i) => (
              <li key={i} className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-xl px-3 py-2.5">
                <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <span className="text-xs text-gray-300 truncate flex-1">{file.name}</span>
                <span className="text-[10px] text-gray-600 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={handleDetect}
          className="
            w-full flex items-center justify-center gap-2
            px-6 py-3.5 rounded-xl
            bg-gradient-to-r from-violet-700 via-violet-600 to-violet-500 text-white
            text-sm font-semibold
            hover:from-violet-800 hover:via-violet-700 hover:to-violet-600
            hover:shadow-lg hover:shadow-violet-600/20
            active:scale-[0.98] transition-all duration-200
          "
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Run AI Detection
        </button>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 flex flex-col items-center gap-5">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-2 border-violet-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500 animate-spin" />
          <div className="absolute inset-2 rounded-full bg-violet-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white mb-1">Analysing documents…</p>
          <p className="text-xs text-gray-500">Running deep learning inference on {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="w-full max-w-xs h-1 rounded-full bg-gray-800 overflow-hidden">
          <div className="h-full rounded-full bg-violet-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (errorMsg) {
    return (
      <div className="bg-gray-900 border border-red-500/20 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
        <div className="w-11 h-11 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Detection failed</p>
          <p className="text-xs text-gray-500">{errorMsg}</p>
        </div>
        <button type="button" onClick={handleReset} className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold text-gray-300 hover:text-white transition-all duration-150">
          Try again
        </button>
      </div>
    );
  }

  // ── Results state ─────────────────────────────────────────────────────────
  if (results) {
    return (
      <div className="space-y-4">
        {/* Results header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Detection complete — {results.length} file{results.length !== 1 ? 's' : ''} analysed
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Scroll to see detailed segment breakdowns</p>
          </div>
          <button type="button" onClick={handleReset} className="text-xs font-semibold text-gray-500 hover:text-white transition-colors">
            Scan again
          </button>
        </div>

        {/* Degraded-accuracy banner (when LR model is absent) */}
        {modelWarning && (
          <div className="flex items-start gap-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3" role="alert">
            <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-xs text-amber-400">Detection running in reduced accuracy mode. Contact admin.</p>
          </div>
        )}

        {/* Per-file result cards */}
        {results.map((res, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-white truncate">{res.filename}</p>
              </div>
              <VerdictBadge verdict={res.verdict} />
            </div>

            <ScoreBar score={res.score} />

            <div className="flex items-center justify-between bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-2.5">
              <span className="text-xs text-gray-500">Model confidence</span>
              <span className="text-xs font-semibold text-white">{res.confidence}</span>
            </div>

            {res.warning && (
              <div className="flex items-start gap-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
                <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-xs text-amber-400">{res.warning}</p>
              </div>
            )}

            <ChunkMap chunks={res.chunk_scores} />
          </div>
        ))}
      </div>
    );
  }

  return null;
>>>>>>> main
}
