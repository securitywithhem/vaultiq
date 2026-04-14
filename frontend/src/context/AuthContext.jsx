import React, { createContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]                       = useState(null);
  const [isLoading, setIsLoading]             = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ── Restore session on mount ─────────────────────────────────────────────
  // Backend uses HttpOnly cookies — we can't read them from JS.
  // Call /api/auth/me: if the cookie is valid the backend returns the user;
  // if not (401) the user is not logged in. Either way we set isLoading=false.
  useEffect(() => {
    let cancelled = false;

    authService.getMe()
      .then(({ user: me }) => {
        if (!cancelled) {
          setUser(me);
          setIsAuthenticated(true);
        }
      })
      .catch(() => {
        // 401 = no valid session — expected on first visit / after logout
        if (!cancelled) {
          setUser(null);
          setIsAuthenticated(false);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // ── login ────────────────────────────────────────────────────────────────
  // Calls POST /api/auth/login. Backend sets HttpOnly cookies on success.
  // Throws an Error (with .response attached) on failure so the caller can
  // display a toast with the server's error message.
  const login = useCallback(async (email, password) => {
    const { user: me } = await authService.login(email, password);
    setUser(me);
    setIsAuthenticated(true);
    return me;
  }, []);

  // ── register ─────────────────────────────────────────────────────────────
  // Calls POST /api/auth/register. Backend sets cookies on success so the
  // user is immediately authenticated — no need to redirect to /login first.
  const register = useCallback(async (fullName, email, password) => {
    const { user: me } = await authService.register(email, password, fullName);
    setUser(me);
    setIsAuthenticated(true);
    return me;
  }, []);

  // ── logout ───────────────────────────────────────────────────────────────
  // Calls POST /api/auth/logout to clear the HttpOnly cookies server-side,
  // then resets local state.
  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (_) {
      // Ignore — even if the request fails we still clear local state
    }
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
