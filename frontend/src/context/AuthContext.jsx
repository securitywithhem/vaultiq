import React, { createContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('vaultiq_token') || null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await authService.getMe();
      setUser(data.user);
    } catch (error) {
      localStorage.removeItem('vaultiq_token');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const data = await authService.login(email, password);
    localStorage.setItem('vaultiq_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (email, password, fullName) => {
    const data = await authService.register(email, password, fullName);
    localStorage.setItem('vaultiq_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('vaultiq_token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};
