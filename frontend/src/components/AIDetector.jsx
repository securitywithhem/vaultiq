import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { detectFiles, detectVaultFiles, fetchAIHistory } from '../api/aiDetectApi';
import { fileService } from '../services/fileService';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILES = 5;

// ─── Sub-components ──────────────────────────────────────────────────────────

const VerdictBadge = ({ verdict }) => {
  const cfg = {
    human: { label: 'Human Written', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
    mixed: { label: 'Mixed Content', bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  }[verdict] ?? { label: 'AI Generated', bg: 'bg-red-500/10 border-red-500/20 text-red-400' };

  return (
    <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
};

const ScoreGauge = ({ score }) => {
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#10b981';
  const r = 32;
  const circ = 2 * Math.PI * r;
  const filled = circ * (pct / 100);
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(31, 41, 55, 0.5)" strokeWidth="6" />
        <motion.circle
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${filled} ${circ}` }}
          transition={{ duration: 1, ease: "easeOut" }}
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-white tracking-tighter" style={{ color }}>{pct}%</span>
        <span className="text-[8px] font-bold text-gray-600 uppercase">AI Score</span>
      </div>
    </div>
  );
};

const ChunkMap = ({ chunks }) => {
  if (!chunks?.length) return null;
  return (
    <div className="space-y-2 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Segment Analysis</p>
      </div>
      <div className="flex gap-1 flex-wrap">
        {chunks.map((score, i) => {
          const bg = score > 0.7 ? 'bg-red-500' : score > 0.4 ? 'bg-amber-400' : 'bg-emerald-500';
          return (
            <div
              key={i}
              title={`Segment ${i + 1}: ${Math.round(score * 100)}% AI`}
              className={`h-3 w-3 rounded-sm ${bg} opacity-80 hover:opacity-100 transition-opacity cursor-help`}
            />
          );
        })}
      </div>
    </div>
  );
};

// ─── AIDetector ──────────────────────────────────────────────────────────────

export default function AIDetector() {
  const [mode, setMode] = useState('upload'); // 'upload' | 'vault' | 'history'
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  
  const onDrop = useCallback((accepted) => {
    setSelectedFiles(accepted.slice(0, MAX_FILES));
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
    maxFiles: MAX_FILES,
  });

  const handleReset = () => {
    setSelectedFiles([]);
    setSelectedVaultIds([]);
    setResults(null);
    setErrorMsg('');
    setModelWarning(null);
  };

  const toggleVaultFile = (id) => {
    setSelectedVaultIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < MAX_FILES ? [...prev, id] : prev
    );
  };

  // ── Data Fetching ─────────────────────────────────────────────────────────
  
  useEffect(() => {
    if (mode === 'vault') {
      setVaultLoading(true);
      fileService.getFiles(0)
        .then(data => setVaultFiles(data.files || []))
        .catch(() => setVaultFiles([]))
        .finally(() => setVaultLoading(false));
    } else if (mode === 'history') {
      setHistoryLoading(true);
      fetchAIHistory()
        .then(data => setHistory(data))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false));
    }
  }, [mode]);

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
      setErrorMsg(err.message || 'Detection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredVault = vaultFiles.filter(f =>
    f.filename.toLowerCase().includes(vaultSearch.toLowerCase())
  );

  const canDetect = mode === 'upload' ? selectedFiles.length > 0 : selectedVaultIds.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      {/* ── Left Column: Config & Selection ──────────────────────────────── */}
      <div className="lg:col-span-12 xl:col-span-7 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-1.5 flex items-center gap-1">
          {[
            { id: 'upload', label: 'Upload Files', icon: (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            )},
            { id: 'vault', label: 'From Vault', icon: (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            )},
            { id: 'history', label: 'Scan History', icon: (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setMode(tab.id); handleReset(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                mode === tab.id 
                  ? 'bg-gray-800 text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Panels */}
        <AnimatePresence mode="wait">
          {mode === 'upload' && (
            <motion.div 
              key="upload" 
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-4"
            >
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 group cursor-pointer ${
                  isDragActive 
                    ? 'border-violet-500 bg-violet-500/5' 
                    : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900/60'
                }`}
              >
                <input {...getInputProps()} />
                <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200">
                  <svg className="w-6 h-6 text-gray-500 transition-colors group-hover:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">
                  {isDragActive ? "Drop them now" : "Select or drop documents"}
                </h4>
                <p className="text-xs text-gray-600">PDF, DOCX, or TXT • Max 5 files</p>
              </div>

              {selectedFiles.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Queue</span>
                    <button onClick={() => setSelectedFiles([])} className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest">Clear All</button>
                  </div>
                  <ul className="divide-y divide-gray-800">
                    {selectedFiles.map((f, i) => (
                      <li key={i} className="px-4 py-3 flex items-center gap-3 text-xs text-gray-300">
                        <svg className="w-4 h-4 text-violet-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        <span className="truncate">{f.name}</span>
                        <span className="ml-auto text-[10px] text-gray-600 font-mono">{(f.size/1024).toFixed(1)}KB</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {mode === 'vault' && (
            <motion.div 
              key="vault" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-4"
            >
              <div className="relative group">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-focus-within:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" /></svg>
                <input 
                  type="text" 
                  placeholder="Search vault..." 
                  className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-3 pl-11 pr-4 text-sm text-white focus:border-violet-500/50 outline-none transition-all"
                  value={vaultSearch}
                  onChange={e => setVaultSearch(e.target.value)}
                />
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl max-h-[320px] overflow-y-auto overflow-x-hidden p-2 space-y-1 custom-scrollbar">
                {vaultLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 opacity-50">
                    <div className="w-5 h-5 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
                    <span className="text-xs font-semibold text-gray-500">Retrieving Files...</span>
                  </div>
                ) : filteredVault.length === 0 ? (
                  <div className="py-10 text-center text-xs text-gray-600 font-semibold italic">No files found.</div>
                ) : (
                  filteredVault.map(f => {
                    const isSelected = selectedVaultIds.includes(f.id);
                    const disabled = !isSelected && selectedVaultIds.length >= MAX_FILES;
                    return (
                      <button
                        key={f.id}
                        disabled={disabled}
                        onClick={() => toggleVaultFile(f.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                          isSelected ? 'bg-violet-500/10 text-violet-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${isSelected ? 'bg-violet-500 border-violet-500' : 'border-gray-700'}`}>
                          {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="text-xs font-semibold truncate flex-1 text-left">{f.filename}</span>
                        <span className="text-[10px] font-bold text-gray-700 uppercase tracking-tighter">{(f.file_size/1024).toFixed(0)}KB</span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{selectedVaultIds.length} / {MAX_FILES} Selected</span>
                {selectedVaultIds.length > 0 && (
                  <button onClick={() => setSelectedVaultIds([])} className="text-[10px] font-bold text-gray-600 hover:text-white transition-colors uppercase tracking-widest">Clear Selection</button>
                )}
              </div>
            </motion.div>
          )}

          {mode === 'history' && (
            <motion.div 
              key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden h-[400px] flex flex-col"
            >
              <div className="px-4 py-3 border-b border-gray-800">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-loose">Recent Detections</h4>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {historyLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 opacity-50">
                    <div className="w-5 h-5 border-2 border-gray-700 border-t-violet-500 rounded-full animate-spin" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 text-center opacity-50">
                    <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-800 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-600">No History recorded yet.</span>
                  </div>
                ) : (
                  history.map((h, i) => {
                    const pct = Math.round((h.score || 0) * 100);
                    const color = pct >= 70 ? 'text-red-500' : pct >= 40 ? 'text-amber-500' : 'text-emerald-500';
                    return (
                      <div key={i} className="flex flex-col gap-2 p-3 rounded-xl bg-gray-800/40 border border-gray-800/60">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-gray-200 truncate">{h.filename}</span>
                          <span className={`text-xs font-mono font-bold ${color}`}>{pct}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-600 font-semibold">{new Date(h.timestamp).toLocaleDateString()} at {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <VerdictBadge verdict={h.verdict} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Button */}
        <div className="pt-2">
          {mode !== 'history' && (
            <button
              onClick={handleDetect}
              disabled={isLoading || !canDetect}
              className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all duration-200 shadow-xl ${
                isLoading 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' 
                  : !canDetect 
                    ? 'bg-gray-900 text-gray-700 border border-gray-800 cursor-not-allowed'
                    : 'bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:scale-[1.01] hover:shadow-violet-500/20 active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-700 border-t-white rounded-full animate-spin" />
                  ANALYSING DOCUMENTS...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  </svg>
                  Scan for AI Activity
                </>
              )}
            </button>
          )}
          
          {errorMsg && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 text-red-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <p className="text-xs font-semibold text-red-400">{errorMsg}</p>
            </motion.div>
          )}

          {modelWarning && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <p className="text-xs font-semibold text-amber-400">Running in degraded mode (accuracy reduced).</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Right Column: Analysis Results ───────────────────────────────── */}
      <div className="lg:col-span-12 xl:col-span-5 relative">
        <AnimatePresence mode="wait">
          {!results && !isLoading ? (
            <motion.div 
              key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full bg-gray-900 border border-gray-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className="w-20 h-20 rounded-3xl bg-gray-950 border border-gray-800 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-white font-bold tracking-tight">AI Diagnostic Panel</h3>
                <p className="text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
                  Run a scan to unveil the generation patterns within your documents. High confidence scores indicate probable AI activity.
                </p>
              </div>
            </motion.div>
          ) : isLoading ? (
            <motion.div 
              key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full bg-gray-900 border border-gray-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-6"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-2 border-violet-500/10" />
                <div className="absolute inset-0 w-20 h-20 rounded-full border-t-2 border-violet-500 animate-spin" />
              </div>
              <div className="space-y-4 w-full">
                <div className="space-y-1">
                  <h3 className="text-white font-bold">Deep Scan in Progress</h3>
                  <p className="text-xs text-gray-500 font-mono tracking-tighter">Deconstructing document structure...</p>
                </div>
                <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ x: "-100%" }} animate={{ x: "0%" }} transition={{ duration: 10, ease: "easeInOut" }}
                    className="w-full h-full bg-violet-600" 
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="results" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} 
              className="space-y-4 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar"
            >
              <div className="flex items-center justify-between px-2 mb-2">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Diagnostic Results</h3>
                <button onClick={handleReset} className="text-[10px] font-bold text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Dismiss</button>
              </div>
              
              {results.map((res, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-1">Source File</p>
                      <h4 className="text-sm font-bold text-white truncate">{res.filename}</h4>
                    </div>
                    <VerdictBadge verdict={res.verdict} />
                  </div>

                  <div className="flex items-center gap-6 p-4 bg-gray-950/50 border border-gray-800/60 rounded-2xl">
                    <ScoreGauge score={res.score} />
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-600 uppercase">Confidence</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          res.confidence === 'high' ? 'bg-violet-500/10 text-violet-400' : 'bg-gray-800 text-gray-400'
                        }`}>{res.confidence}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-600 uppercase">Segments</span>
                        <span className="text-[10px] font-bold text-gray-400">{res.chunks_count || res.chunk_scores?.length || 0} analysed</span>
                      </div>
                      {res.similarity_score !== undefined && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-600 uppercase">Repetition</span>
                          <span className="text-[10px] font-bold text-gray-400">{Math.round(res.similarity_score * 100)}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {res.warning && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-[10px] font-semibold text-amber-400 leading-relaxed italic">
                      ⚠ {res.warning}
                    </div>
                  )}

                  <ChunkMap chunks={res.chunk_scores} />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
