import React, { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import styles from './Navbar.module.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '?';

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleMenu = () => setIsMobileMenuOpen(m => !m);

  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        {/* Logo */}
        <div className={styles.logoContainer}>
          <svg className={styles.logoIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className={styles.logoText}>VaultIQ</span>
        </div>

        {/* Desktop Links */}
        <div className={styles.desktopLinks}>
          <NavLink to="/dashboard"    className={({ isActive }) => isActive ? `${styles.link} ${styles.activeLink}` : styles.link}>Dashboard</NavLink>
          <NavLink to="/analytics"    className={({ isActive }) => isActive ? `${styles.link} ${styles.activeLink}` : styles.link}>Analytics</NavLink>
          <NavLink to="/ai-detection" className={({ isActive }) => isActive ? `${styles.link} ${styles.activeLink}` : styles.link}>AI Check</NavLink>
        </div>

        {/* Desktop Profile Dropdown */}
        <div className={styles.desktopUser}>
          <div className={styles.profileWrapper} ref={profileRef}>
            <button
              className={styles.avatarBtn}
              onClick={() => setIsProfileOpen(p => !p)}
              aria-label="Open profile menu"
              aria-expanded={isProfileOpen}
            >
              <span className={styles.avatar}>{initials}</span>
              <svg
                className={`${styles.chevron} ${isProfileOpen ? styles.chevronOpen : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
                width="13" height="13"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isProfileOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropdownHeader}>
                  <span className={styles.dropdownAvatar}>{initials}</span>
                  <div className={styles.dropdownMeta}>
                    <p className={styles.dropdownEmail} title={user?.email}>{user?.email}</p>
                    <p className={styles.dropdownRole}>Vault Member</p>
                  </div>
                </div>
                <div className={styles.dropdownDivider} />
                <button
                  className={styles.dropdownItem}
                  onClick={() => { logout(); setIsProfileOpen(false); }}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="15" height="15">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu button */}
        <button className={styles.mobileMenuBtn} onClick={toggleMenu} aria-label="Toggle menu">
          <svg className={styles.menuIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMobileMenuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className={styles.mobileMenu}>
          <NavLink to="/dashboard"    className={styles.mobileLink} onClick={toggleMenu}>Dashboard</NavLink>
          <NavLink to="/analytics"    className={styles.mobileLink} onClick={toggleMenu}>Analytics</NavLink>
          <NavLink to="/ai-detection" className={styles.mobileLink} onClick={toggleMenu}>AI Check</NavLink>
          <div className={styles.mobileUserSection}>
            <span className={styles.mobileUserEmail}>{user?.email}</span>
            <button onClick={() => { logout(); toggleMenu(); }} className={styles.mobileLogoutBtn}>Sign Out</button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
