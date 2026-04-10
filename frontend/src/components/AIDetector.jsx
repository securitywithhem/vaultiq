// AI Detection Module
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

export default function AIDetector() {
  const [selectedFiles, setSelectedFiles] = useState([]);
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
  };

  const handleDetect = async () => {
    if (!selectedFiles.length) return;
    setIsLoading(true);
    setErrorMsg('');
    setResults(null);
    try {
      const data = await detectFiles(selectedFiles);
      setResults(data.results);
      setModelWarning(data.model_warning || null);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

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
}
