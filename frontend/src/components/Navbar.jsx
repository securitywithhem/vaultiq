import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getUser, logout } from '../services/auth';

export default function Navbar() {
  const location = useLocation();
  const user = getUser();

  const links = [
    { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
    { to: '/analytics', label: 'Analytics', icon: '◈' },
    { to: '/plagiarism', label: 'Plagiarism', icon: '⎔' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <div className="navbar-brand">
          <div className="navbar-logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="6" fill="var(--primary)" />
              <path
                d="M14 6L8 10V15C8 19.42 10.56 23.43 14 24.5C17.44 23.43 20 19.42 20 15V10L14 6Z"
                fill="white"
                opacity="0.9"
              />
              <path
                d="M13 15.17L11.41 13.59L10 15L13 18L19 12L17.59 10.59L13 15.17Z"
                fill="var(--primary)"
              />
            </svg>
          </div>
          <span className="navbar-title">VaultIQ</span>
        </div>

        {/* Navigation Links */}
        <div className="navbar-links">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={`navbar-link ${
                location.pathname === link.to ? 'navbar-link--active' : ''
              }`}
            >
              <span className="navbar-link-icon">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* User Section */}
        <div className="navbar-user">
          {user && (
            <span className="navbar-email" title={user.email}>
              {user.email || user.name || 'User'}
            </span>
          )}
          <button className="navbar-logout" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 2H3C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M10.5 11.5L14 8L10.5 4.5M5.5 8H13.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
