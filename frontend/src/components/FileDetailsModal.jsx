import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { formatFileSize } from '../utils/format';

const FileDetailsModal = ({ file, onClose }) => {
  const overlayRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const copyHash = () => {
    navigator.clipboard.writeText(file.sha256_hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const uploadDate = file.uploaded_at
    ? new Date(file.uploaded_at).toLocaleString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '—';

  const mimeLabel = () => {
    const m = file.mime_type || '';
    if (m.includes('pdf')) return 'PDF Document';
    if (m.includes('wordprocessingml')) return 'Word Document (DOCX)';
    if (m.includes('plain')) return 'Plain Text';
    if (m.includes('markdown')) return 'Markdown';
    if (m.includes('rtf')) return 'Rich Text (RTF)';
    return file.mime_type || 'Unknown';
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      ref={overlayRef} 
      onClick={handleOverlayClick}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
          <h3 className="text-sm font-semibold text-white tracking-wide">File Details</h3>
          <button 
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-all duration-150" 
            onClick={onClose} 
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-1">Filename</p>
            <p className="text-sm font-medium text-white break-all leading-relaxed">{file.filename}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailItem label="File Size" value={formatFileSize(file.file_size)} sub={`${file.file_size?.toLocaleString()} bytes`} />
            <DetailItem label="Type" value={mimeLabel()} />
            <DetailItem label="Uploaded" value={uploadDate} />
            <DetailItem 
              label="Encryption" 
              value="AES-256-CBC" 
              accent="emerald"
              icon={(
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              )}
            />
          </div>

          <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-widest">SHA-256 Hash</span>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                Integrity verified
              </span>
            </div>
            <div className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3 group">
              <code className="flex-1 text-[11px] font-mono text-gray-400 break-all leading-relaxed whitespace-pre-wrap">{file.sha256_hash}</code>
              <button 
                className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 ${copied ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:text-white hover:border-gray-500'}`} 
                onClick={copyHash} 
                title="Copy hash"
              >
                {copied
                  ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                }
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-white transition-all duration-150"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const DetailItem = ({ label, value, sub, accent, icon }) => (
  <div className="space-y-1">
    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{label}</p>
    <div className="flex items-center gap-2">
      {icon && <span className={accent === 'emerald' ? 'text-emerald-400' : 'text-gray-500'}>{icon}</span>}
      <p className={`text-sm font-medium ${accent === 'emerald' ? 'text-emerald-400' : 'text-gray-200'}`}>
        {value}
      </p>
    </div>
    {sub && <p className="text-[10px] text-gray-600 font-mono">{sub}</p>}
  </div>
);

FileDetailsModal.propTypes = {
  file: PropTypes.shape({
    filename: PropTypes.string.isRequired,
    file_size: PropTypes.number,
    mime_type: PropTypes.string,
    uploaded_at: PropTypes.string,
    sha256_hash: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default FileDetailsModal;
