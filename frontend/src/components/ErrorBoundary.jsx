import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', gap: '20px',
          background: '#0a0a0b', color: '#f5f5f7', padding: '32px', textAlign: 'center'
        }}>
          <svg width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="#ff453a" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#98989e', maxWidth: '420px', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#0a84ff', color: '#fff', border: 'none',
              borderRadius: '10px', padding: '10px 28px', fontWeight: 600,
              cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit',
              transition: 'background 0.2s'
            }}
            onMouseOver={e => e.target.style.background = '#0071e3'}
            onMouseOut={e => e.target.style.background = '#0a84ff'}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
