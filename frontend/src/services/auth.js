import api from './api';

/**
 * Log in a user with email and password.
 * Saves the JWT token to localStorage and returns the user object.
 */
export async function login(email, password) {
  const response = await api.post('/auth/login', { email, password });
  const { token, user } = response.data;
  localStorage.setItem('vaultiq_token', token);
  return user;
}

/**
 * Register a new user with name, email, and password.
 * Saves the JWT token to localStorage and returns the user object.
 */
export async function register(email, password, name) {
  const response = await api.post('/auth/register', { email, password, name });
  const { token, user } = response.data;
  localStorage.setItem('vaultiq_token', token);
  return user;
}

/**
 * Log out the current user by clearing localStorage and redirecting to /login.
 */
export function logout() {
  localStorage.removeItem('vaultiq_token');
  window.location.href = '/login';
}

/**
 * Decode the JWT payload from localStorage to retrieve the user object.
 * Uses native atob — no external library required.
 */
export function getUser() {
  const token = localStorage.getItem('vaultiq_token');
  if (!token) return null;

  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch (err) {
    // TODO: remove in prod
    console.log('Failed to decode JWT:', err);
    return null;
  }
}

/**
 * Check whether a valid token exists in localStorage.
 */
export function isAuthenticated() {
  const token = localStorage.getItem('vaultiq_token');
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Check if token is expired
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('vaultiq_token');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
