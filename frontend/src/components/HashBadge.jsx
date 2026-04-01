import React, { useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import styles from './HashBadge.module.css';

const HashBadge = ({ hash }) => {
  const [copied, setCopied] = useState(false);

  const truncatedHash = hash ? `${hash.substring(0, 16)}...` : 'N/A';

  const handleCopy = () => {
    if (hash) {
      navigator.clipboard.writeText(hash);
      setCopied(true);
      toast.success('Hash copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={styles.container} onClick={handleCopy} title="Copy SHA-256 Hash">
      <div className={styles.typewriterWrapper}>
        <span className={styles.hashText}>{truncatedHash}</span>
      </div>
      <button className={styles.copyBtn} aria-label="Copy hash">
        {copied ? (
          <svg className={styles.iconSuccess} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className={styles.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
};

HashBadge.propTypes = {
  hash: PropTypes.string
};

export default HashBadge;
