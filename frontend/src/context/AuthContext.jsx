import React, { createContext, useState, useEffect, useCallback } from 'react';

const TOKEN_KEY = 'vaultiq_token';
const USER_KEY  = 'vaultiq_user';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]                       = useState(null);
  const [isLoading, setIsLoading]             = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Restore session from localStorage on mount (synchronous — no flicker)
  useEffect(() => {
    const token  = localStorage.getItem(TOKEN_KEY);
    const stored = localStorage.getItem(USER_KEY);
    if (token && stored) {
      try {
        setUser(JSON.parse(stored));
        setIsAuthenticated(true);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  /**
   * login — compares email + password against stored user.
   * Throws a plain Error on mismatch so callers can show a toast.
   */
  const login = useCallback((email, password) => {
    const stored = localStorage.getItem(USER_KEY);
    if (!stored) {
      throw new Error('No account found. Please sign up first.');
    }
    const saved = JSON.parse(stored);
    if (saved.email !== email || saved.password !== password) {
      throw new Error('Incorrect email or password.');
    }
    localStorage.setItem(TOKEN_KEY, 'loggedin');
    setUser(saved);
    setIsAuthenticated(true);
  }, []);

  /**
   * register — persists user to localStorage.
   * Does NOT auto-login; caller redirects to /login.
   */
  const register = useCallback((fullName, email, password) => {
    localStorage.setItem(USER_KEY, JSON.stringify({ fullName, email, password }));
  }, []);

  /**
   * logout — clears token and resets state.
   */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
