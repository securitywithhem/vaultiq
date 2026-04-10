import React from 'react';
import PropTypes from 'prop-types';

const EmptyState = ({ message, submessage, icon, action }) => (
  <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
    <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-4 shrink-0">
      {icon ?? (
        <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )}
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
  icon:       PropTypes.node,
  action:     PropTypes.node,
};

export default EmptyState;
