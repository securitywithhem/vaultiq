/**
 * Tests for frontend/src/pages/Login.jsx
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockLogin    = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ login: mockLogin })
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
  error: jest.fn()
}));

jest.mock('../components/LoadingSpinner', () => () => <span data-testid="spinner" />);

// ─── Helper ───────────────────────────────────────────────────────────────────
const renderLogin = () =>
  render(<BrowserRouter><Login /></BrowserRouter>);

import Login from '../pages/Login';

// ─── Tests ────────────────────────────────────────────────────────────────────
beforeEach(() => jest.clearAllMocks());

test('renders email, password inputs and Sign In button', () => {
  renderLogin();
  expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});

test('submit button is disabled when fields are empty', () => {
  renderLogin();
  expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
});

test('submit button enables when both fields are filled', async () => {
  renderLogin();
  await userEvent.type(screen.getByLabelText(/email address/i), 'a@b.com');
  await userEvent.type(screen.getByLabelText(/password/i), 'secret');
  expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
});

test('calls login() and navigates to /dashboard on success', async () => {
  mockLogin.mockResolvedValueOnce(undefined);
  renderLogin();

  await userEvent.type(screen.getByLabelText(/email address/i), 'a@b.com');
  await userEvent.type(screen.getByLabelText(/password/i), 'Test@1234');
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

  await waitFor(() => {
    expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'Test@1234');
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});

test('shows error toast when login() rejects', async () => {
  const toast = require('react-hot-toast').default;
  mockLogin.mockRejectedValueOnce(new Error('401'));
  renderLogin();

  await userEvent.type(screen.getByLabelText(/email address/i), 'a@b.com');
  await userEvent.type(screen.getByLabelText(/password/i), 'badpass');
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith('Invalid email or password');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

test('toggles password visibility', async () => {
  renderLogin();
  const pwInput = screen.getByLabelText(/^password/i);
  expect(pwInput).toHaveAttribute('type', 'password');

  fireEvent.click(screen.getByRole('button', { name: /show/i }));
  expect(pwInput).toHaveAttribute('type', 'text');

  fireEvent.click(screen.getByRole('button', { name: /hide/i }));
  expect(pwInput).toHaveAttribute('type', 'password');
});

test('link to /register is present', () => {
  renderLogin();
  expect(screen.getByRole('link', { name: /create one now/i })).toHaveAttribute('href', '/register');
});
