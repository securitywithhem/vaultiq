import React from 'react';
import PropTypes from 'prop-types';

const VaultIllustration = () => (
  <svg width="60" height="60" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="12" y="26" width="64" height="50" rx="8" fill="rgba(16,185,129,0.06)" stroke="rgba(16,185,129,0.2)" strokeWidth="1.5"/>
    <rect x="24" y="36" width="40" height="32" rx="5" fill="rgba(16,185,129,0.04)" stroke="rgba(16,185,129,0.15)" strokeWidth="1.5"/>
    <circle cx="44" cy="52" r="9" stroke="#10b981" strokeWidth="1.5" fill="rgba(16,185,129,0.08)"/>
    <circle cx="44" cy="52" r="3" fill="#10b981"/>
    <line x1="44" y1="47" x2="44" y2="43" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M32 26 C32 14 56 14 56 26" stroke="rgba(16,185,129,0.25)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <line x1="60" y1="48" x2="60" y2="56" stroke="rgba(16,185,129,0.3)" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

const SearchIllustration = () => (
  <svg width="60" height="60" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="34" cy="34" r="20" stroke="rgba(163,163,163,0.25)" strokeWidth="1.5" fill="rgba(163,163,163,0.05)"/>
    <line x1="49" y1="49" x2="64" y2="64" stroke="rgba(163,163,163,0.3)" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="28" y1="34" x2="40" y2="34" stroke="rgba(163,163,163,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="34" y1="28" x2="34" y2="40" stroke="rgba(163,163,163,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const EmptyState = ({ message, submessage, icon, action, variant = 'vault' }) => {
  const illustration = icon ?? (variant === 'search' ? <SearchIllustration /> : <VaultIllustration />);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="mb-6 shrink-0 opacity-80">
        {illustration}
      </div>
      <h3 className="text-sm font-semibold text-white mb-2">{message}</h3>
      {submessage && (
        <p className="text-xs text-gray-500 max-w-xs leading-relaxed">{submessage}</p>
      )}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
};

EmptyState.propTypes = {
  message:    PropTypes.string.isRequired,
  submessage: PropTypes.string,
  icon:       PropTypes.node,
  action:     PropTypes.node,
  variant:    PropTypes.oneOf(['vault', 'search']),
};

export default EmptyState;
