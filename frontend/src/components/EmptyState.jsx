import React from 'react';
import PropTypes from 'prop-types';

<<<<<<< HEAD
const VaultIllustration = () => (
  <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Vault body */}
    <rect x="12" y="26" width="64" height="50" rx="8" fill="rgba(10,132,255,0.06)" stroke="rgba(10,132,255,0.2)" strokeWidth="1.5"/>
    {/* Inner door */}
    <rect x="24" y="36" width="40" height="32" rx="5" fill="rgba(10,132,255,0.04)" stroke="rgba(10,132,255,0.15)" strokeWidth="1.5"/>
    {/* Lock circle */}
    <circle cx="44" cy="52" r="9" stroke="#0a84ff" strokeWidth="1.5" fill="rgba(10,132,255,0.08)"/>
    <circle cx="44" cy="52" r="3" fill="#0a84ff"/>
    {/* Lock pointer */}
    <line x1="44" y1="47" x2="44" y2="43" stroke="#0a84ff" strokeWidth="1.5" strokeLinecap="round"/>
    {/* Shackle (arch of lock) */}
    <path d="M32 26 C32 14 56 14 56 26" stroke="rgba(10,132,255,0.25)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    {/* Handle bar */}
    <line x1="60" y1="48" x2="60" y2="56" stroke="rgba(10,132,255,0.3)" strokeWidth="3" strokeLinecap="round"/>
    {/* Bolt dots */}
    <circle cx="20" cy="34" r="2" fill="rgba(10,132,255,0.2)"/>
    <circle cx="20" cy="68" r="2" fill="rgba(10,132,255,0.2)"/>
    <circle cx="68" cy="34" r="2" fill="rgba(10,132,255,0.2)"/>
    <circle cx="68" cy="68" r="2" fill="rgba(10,132,255,0.2)"/>
  </svg>
);

const SearchIllustration = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="34" cy="34" r="20" stroke="rgba(10,132,255,0.25)" strokeWidth="1.5" fill="rgba(10,132,255,0.05)"/>
    <line x1="49" y1="49" x2="64" y2="64" stroke="rgba(10,132,255,0.3)" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="28" y1="34" x2="40" y2="34" stroke="rgba(10,132,255,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="34" y1="28" x2="34" y2="40" stroke="rgba(10,132,255,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const EmptyState = ({ message, submessage, icon, variant = 'vault' }) => {
  const illustration = icon ?? (variant === 'search' ? <SearchIllustration /> : <VaultIllustration />);

  return (
    <div className={styles.container}>
      <div className={styles.illustration}>
        {illustration}
      </div>
      <h3 className={styles.message}>{message}</h3>
      {submessage && <p className={styles.submessage}>{submessage}</p>}
=======
const EmptyState = ({ message, submessage, icon, action }) => (
  <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
    <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-4 shrink-0">
      {icon ?? (
        <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )}
>>>>>>> main
    </div>
    <h3 className="text-sm font-semibold text-white mb-1">{message}</h3>
    {submessage && (
      <p className="text-xs text-gray-500 max-w-xs leading-relaxed">{submessage}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

EmptyState.propTypes = {
  message:    PropTypes.string.isRequired,
  submessage: PropTypes.string,
<<<<<<< HEAD
  icon: PropTypes.node,
  variant: PropTypes.oneOf(['vault', 'search']),
=======
  icon:       PropTypes.node,
  action:     PropTypes.node,
>>>>>>> main
};

export default EmptyState;
