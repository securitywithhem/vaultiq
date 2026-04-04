import React, { createContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService';
import { initCSRFToken } from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status on mount
  const checkAuth = useCallback(async () => {
    try {
      // Initialize CSRF token first
      await initCSRFToken();
      
      // Try to get current user (will fail with 401 if no valid cookie)
      const data = await authService.getMe();
      setUser(data.user);
      setIsAuthenticated(true);
    } catch (error) {
      // No valid token cookie, user is not authenticated
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const data = await authService.login(email, password);
    // Token is stored in httpOnly cookie automatically by backend
    setUser(data.user);
    setIsAuthenticated(true);
    // Fetch CSRF token after login
    await initCSRFToken();
  };

  const register = async (email, password, fullName) => {
    const data = await authService.register(email, password, fullName);
    // Token is stored in httpOnly cookie automatically by backend
    setUser(data.user);
    setIsAuthenticated(true);
    // Fetch CSRF token after registration
    await initCSRFToken();
  };

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.error('[AuthContext.logout]', err.message);
    }
    // Cookies are cleared by backend
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated,
      login,
      register,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};
