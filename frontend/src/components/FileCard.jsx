import React from 'react';
import PropTypes from 'prop-types';
import HashBadge from './HashBadge';
import { formatFileSize, formatRelativeTime, truncateFilename } from '../utils/format';

// ─── Type config ─────────────────────────────────────────────────────────────

const typeConfig = (mimeType = '') => {
  if (mimeType.includes('pdf'))   return { bg: 'bg-red-500/10',    ring: 'ring-red-500/20',    text: 'text-red-400'    };
  if (mimeType.includes('image')) return { bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/20', text: 'text-yellow-400' };
  return                                 { bg: 'bg-sky-500/10',     ring: 'ring-sky-500/20',    text: 'text-sky-400'    };
};

const TypeIcon = ({ mimeType = '' }) => {
  if (mimeType.includes('pdf')) return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
  if (mimeType.includes('image')) return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
};

// ─── FileCard ─────────────────────────────────────────────────────────────────

const FileCard = ({ file, onDownload, onDelete }) => {
  const cfg = typeConfig(file.mime_type);

  const handleDelete = () => {
    if (window.confirm('Delete this file permanently?')) onDelete(file.id);
  };

  return (
    <div className="group bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl ${cfg.bg} ring-1 ${cfg.ring} flex items-center justify-center shrink-0`}>
          <span className={cfg.text}>
            <TypeIcon mimeType={file.mime_type} />
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Encrypted
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-white truncate mb-1" title={file.filename}>
          {truncateFilename(file.filename)}
        </h4>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
          <span>{formatFileSize(file.file_size)}</span>
          <span className="w-0.5 h-0.5 rounded-full bg-gray-700 inline-block" />
          <span>{formatRelativeTime(file.uploaded_at)}</span>
        </div>
        <HashBadge hash={file.sha256_hash} />
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
        <button
          type="button"
          onClick={() => onDownload(file.id, file.filename)}
          aria-label="Download file"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 text-xs font-semibold text-gray-300 hover:text-white transition-all duration-150"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete file"
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-800/60 hover:bg-red-500/10 border border-gray-700/50 hover:border-red-500/30 text-gray-500 hover:text-red-400 transition-all duration-150 shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
};

FileCard.propTypes = {
  file: PropTypes.shape({
    id:          PropTypes.string.isRequired,
    filename:    PropTypes.string.isRequired,
    file_size:   PropTypes.number.isRequired,
    mime_type:   PropTypes.string,
    uploaded_at: PropTypes.string.isRequired,
    sha256_hash: PropTypes.string.isRequired,
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
  onDelete:   PropTypes.func.isRequired,
};

export default FileCard;
