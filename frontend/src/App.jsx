import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import LoadingSpinner from './components/LoadingSpinner';

const AnalyticsDashboard = React.lazy(() => import('./components/AnalyticsDashboard'));
const TextAiDetection = React.lazy(() => import('./pages/TextAiDetection'));

const App = () => {
  return (
    <>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: 'var(--bg-surface, #1c1c1e)',
            color: 'var(--text-primary, #f5f5f7)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: '12px',
            fontSize: '0.875rem',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '12px 16px',
          },
          success: {
            iconTheme: { primary: '#30d158', secondary: '#1c1c1e' },
          },
          error: {
            iconTheme: { primary: '#ff453a', secondary: '#1c1c1e' },
          },
        }}
      />
      <ErrorBoundary>
        <Routes>
          {/* Public Routes */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Routes */}
          <Route path="/" element={<ProtectedRoute />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="analytics" element={
              <React.Suspense fallback={<LoadingSpinner />}>
                <AnalyticsDashboard />
              </React.Suspense>
            } />
            <Route path="ai-detection" element={
              <React.Suspense fallback={<LoadingSpinner />}>
                <TextAiDetection />
              </React.Suspense>
            } />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ErrorBoundary>
    </>
  );
};

export default App;
