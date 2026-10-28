import React from 'react';

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4 mr-2 shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

/**
 * Reusable Button component.
 *
 * Props
 * ─────
 * variant   – 'primary' | 'outline' | 'ghost'  (default: 'primary')
 * size      – 'sm' | 'md' | 'lg'               (default: 'md')
 * fullWidth – stretch to 100% width             (default: true)
 * isLoading – show spinner and disable          (default: false)
 */
const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  isLoading = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const sizes = {
    sm: 'px-4 py-2.5 text-xs',
    md: 'px-6 py-[0.82rem] text-sm',
    lg: 'px-8 py-4 text-base',
  };

  const variants = {
    primary: [
      'bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 text-white font-semibold',
      'hover:from-emerald-800 hover:via-emerald-700 hover:to-emerald-600',
      'hover:shadow-xl hover:shadow-emerald-600/25',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2',
      'active:scale-[0.98] active:shadow-none',
    ].join(' '),

    outline: [
      'bg-white text-gray-700 font-semibold border border-gray-200',
      'hover:bg-gray-50 hover:border-gray-300',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300/60',
      'active:scale-[0.98]',
    ].join(' '),

    ghost: [
      'bg-transparent text-gray-600 font-semibold',
      'hover:bg-gray-100',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300/60',
      'active:scale-[0.98]',
    ].join(' '),
  };

  return (
    <button
      disabled={isLoading || disabled}
      className={[
        'inline-flex items-center justify-center rounded-xl',
        'transition-all duration-200 ease-out select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none',
        sizes[size] ?? sizes.md,
        variants[variant] ?? variants.primary,
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner />
          <span>Loading…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
