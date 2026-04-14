import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// ─── Icons ────────────────────────────────────────────────────────────────────

const ShieldIcon = () => (
  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const BarsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// ─── Nav link definitions ─────────────────────────────────────────────────────

const NAV_LINKS = [
  { to: '/dashboard',    label: 'Dashboard'    },
  { to: '/files',        label: 'Files'        },
  { to: '/ai-detection', label: 'AI Detection' },
  { to: '/analytics',    label: 'Analytics'    },
];

// ─── AppNavbar ────────────────────────────────────────────────────────────────

const AppNavbar = () => {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try { await logout(); } catch (_) { /* ignore */ }
    navigate('/login');
  };

  const initial     = user?.email?.[0]?.toUpperCase() ?? 'U';
  const displayName = user?.email?.length > 26
    ? `${user.email.slice(0, 23)}…`
    : user?.email ?? '';

  // Shared active/inactive class builders
  const desktopLinkClass = ({ isActive }) =>
    isActive
      ? 'px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-gray-800'
      : 'px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all duration-150';

  const mobileLinkClass = ({ isActive }) =>
    isActive
      ? 'block px-3 py-2 rounded-lg text-sm font-semibold text-white bg-gray-800'
      : 'block px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all duration-150';

  return (
    <nav className="sticky top-0 z-50 bg-gray-900/90 backdrop-blur-md border-b border-gray-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-6">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/20">
              <ShieldIcon />
            </div>
            <span className="text-base font-semibold text-white tracking-tight select-none">
              VaultIQ
            </span>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5 flex-1">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to} className={desktopLinkClass}>
                {label}
              </NavLink>
            ))}
          </div>

          {/* Desktop user + logout */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-emerald-400 leading-none">{initial}</span>
              </div>
              <span className="text-sm text-gray-400 max-w-[180px] truncate hidden lg:block">
                {displayName}
              </span>
            </div>
            <div className="w-px h-4 bg-gray-700" aria-hidden="true" />
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-gray-500 hover:text-red-400 transition-colors duration-150"
            >
              Logout
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-150"
          >
            {menuOpen ? <XIcon /> : <BarsIcon />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={mobileLinkClass}
              >
                {label}
              </NavLink>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-emerald-400">{initial}</span>
              </div>
              <span className="text-xs text-gray-500 truncate max-w-[200px]">{displayName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default AppNavbar;
