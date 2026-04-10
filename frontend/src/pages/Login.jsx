import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import BrandPanel from '../components/ui/BrandPanel';
import { useAuth } from '../hooks/useAuth';

const EASE = [0.25, 0.1, 0.25, 1];

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

const ShieldIcon = () => (
  <svg
    className="w-4 h-4 text-emerald-600"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>
);

const EyeIcon = () => (
  <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

const GoogleIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

// ─── Login page ───────────────────────────────────────────────────────────────

const Login = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate                   = useNavigate();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);

  // Already logged in — skip the login page
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row lg:h-screen font-sans antialiased bg-[#F7F8FA]">

      {/* ── LEFT: Form panel ──────────────────────────────────────────────── */}
      <div className="
        order-1
        w-full lg:w-[44%]
        flex items-center justify-center
        bg-[#F7F8FA]
        px-6 py-16 lg:px-16 lg:py-0
        lg:overflow-y-auto
      ">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="w-full max-w-[370px]"
        >

          {/* Brand mark */}
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <ShieldIcon />
            </div>
            <span className="text-xl font-semibold tracking-tight text-gray-900">
              VaultIQ
            </span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 leading-tight mb-2">
              Welcome back
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Sign in to access your encrypted vault.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <Input
              label="Password"
              labelRight={
                <button
                  type="button"
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors bg-transparent border-none p-0 cursor-pointer"
                >
                  Forgot password?
                </button>
              }
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              }
              required
            />

            <div className="pt-1">
              <Button type="submit" isLoading={isLoading}>
                Sign In
              </Button>
            </div>

            {/* Trust signal */}
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <p className="text-[11px] text-gray-400">
                Your files are encrypted before they leave your device.
              </p>
            </div>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#F7F8FA] px-3 text-xs font-medium text-gray-400">
                or continue with
              </span>
            </div>
          </div>

          {/* Google SSO (UI only) */}
          <button
            type="button"
            className="
              w-full flex items-center justify-center gap-3
              px-5 py-[0.72rem] rounded-xl
              border border-gray-200 bg-white
              text-sm font-semibold text-gray-700
              shadow-sm
              hover:bg-gray-50 hover:border-gray-300
              active:scale-[0.98]
              transition-all duration-150
            "
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Footer */}
          <p className="text-center text-sm text-gray-500 mt-8">
            Don't have an account?{' '}
            <Link
              to="/signup"
              className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Sign up for free
            </Link>
          </p>
        </motion.div>
      </div>

      {/* ── RIGHT: Brand panel ─────────────────────────────────────────────── */}
      <div className="order-2 lg:flex-1">
        <BrandPanel />
      </div>

    </div>
  );
};

export default Login;
