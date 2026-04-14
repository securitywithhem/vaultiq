import React, { useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';

const HashBadge = ({ hash }) => {
  const [copied, setCopied] = useState(false);
  const truncatedHash = hash ? `${hash.substring(0, 16)}…` : 'N/A';

  const handleCopy = () => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopied(true);
    toast.success('Hash copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Click to copy SHA-256 hash"
      aria-label="Copy SHA-256 hash"
      className="group flex items-center gap-2 w-full bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-lg px-2.5 py-1.5 transition-all duration-150"
    >
      <span className="font-mono text-[10px] text-gray-500 truncate flex-1 text-left tracking-tight">
        {truncatedHash}
      </span>
      {copied ? (
        <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
};

HashBadge.propTypes = { hash: PropTypes.string };

export default HashBadge;
