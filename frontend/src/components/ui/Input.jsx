import React from 'react';

/**
 * Reusable Input component.
 *
 * Props
 * ─────
 * label        – visible label text (left side of label row)
 * labelRight   – right-side label node, e.g. "Forgot password?" link
 * rightElement – icon/button rendered inside the input on the right edge
 * error        – error string shown below the input
 * All other props are forwarded to <input>.
 */
const Input = React.forwardRef(
  (
    {
      label,
      labelRight,
      type = 'text',
      placeholder,
      value,
      onChange,
      error,
      rightElement,
      className = '',
      ...props
    },
    ref
  ) => {
    const hasLabelRow = label || labelRight;

    return (
      <div className="w-full">
        {hasLabelRow && (
          <div className="flex items-center justify-between mb-1.5">
            {label && (
              <label className="block text-sm font-medium text-gray-700 select-none">
                {label}
              </label>
            )}
            {labelRight && labelRight}
          </div>
        )}

        <div className="relative">
          <input
            ref={ref}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className={[
              // base
              'w-full px-4 py-3 rounded-xl bg-white text-gray-900 placeholder-gray-400',
              'text-sm outline-none transition-all duration-150 shadow-sm',
              // border + focus ring
              error
                ? 'border border-red-300 ring-2 ring-red-400/20'
                : 'border border-gray-200 hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20',
              // right-pad when there's an icon
              rightElement ? 'pr-11' : '',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          />

          {rightElement && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center">
              {rightElement}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-1.5 text-xs font-medium text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
