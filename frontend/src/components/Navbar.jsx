import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import styles from './Navbar.module.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Helper to truncate email if too long
  const displayEmail = user?.email?.length > 20 
    ? `${user.email.substring(0, 17)}...` 
    : user?.email;

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        {/* Logo Section */}
        <div className={styles.logoContainer}>
          <svg className={styles.logoIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className={styles.logoText}>VaultIQ</span>
        </div>

        {/* Desktop Links */}
        <div className={styles.desktopLinks}>
          <NavLink to="/dashboard" className={({isActive}) => isActive ? `${styles.link} ${styles.activeLink}` : styles.link}>
            Dashboard
          </NavLink>
          <NavLink to="/analytics" className={({isActive}) => isActive ? `${styles.link} ${styles.activeLink}` : styles.link}>
            Analytics
          </NavLink>
          <NavLink to="/plagiarism" className={({isActive}) => isActive ? `${styles.link} ${styles.activeLink}` : styles.link}>
            AI Check
          </NavLink>
        </div>

        {/* Desktop User Section */}
        <div className={styles.desktopUser}>
          <span className={styles.userEmail} title={user?.email}>{displayEmail}</span>
          <button onClick={logout} className={styles.logoutBtn}>Logout</button>
        </div>

        {/* Mobile menu button */}
        <button className={styles.mobileMenuBtn} onClick={toggleMenu} aria-label="Toggle menu">
          <svg className={styles.menuIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu Panel */}
      {isMobileMenuOpen && (
        <div className={styles.mobileMenu}>
          <NavLink to="/dashboard" className={styles.mobileLink} onClick={toggleMenu}>Dashboard</NavLink>
          <NavLink to="/analytics" className={styles.mobileLink} onClick={toggleMenu}>Analytics</NavLink>
          <NavLink to="/plagiarism" className={styles.mobileLink} onClick={toggleMenu}>AI Check</NavLink>
          <div className={styles.mobileUserSection}>
            <span className={styles.mobileUserEmail}>{user?.email}</span>
            <button onClick={() => { logout(); toggleMenu(); }} className={styles.mobileLogoutBtn}>Logout</button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
