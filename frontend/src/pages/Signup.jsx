import React, { useState, useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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

const CheckIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

// ─── Password strength logic ──────────────────────────────────────────────────

const RULES = [
  { id: 'length',  label: 'At least 8 characters',         test: (p) => p.length >= 8 },
  { id: 'case',    label: 'Uppercase & lowercase letters',  test: (p) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { id: 'number',  label: 'Contains a number',             test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'Special character',             test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const STRENGTH_META = [
  { label: '',        barColor: 'bg-gray-200',   textColor: 'text-gray-400'   },
  { label: 'Weak',    barColor: 'bg-red-400',    textColor: 'text-red-500'    },
  { label: 'Fair',    barColor: 'bg-amber-400',  textColor: 'text-amber-500'  },
  { label: 'Good',    barColor: 'bg-yellow-400', textColor: 'text-yellow-600' },
  { label: 'Strong',  barColor: 'bg-emerald-500', textColor: 'text-emerald-600' },
];

const usePasswordStrength = (password) =>
  useMemo(() => {
    const passed = RULES.filter((r) => r.test(password)).length;
    return { score: passed, passing: RULES.map((r) => r.test(password)) };
  }, [password]);

// ─── PasswordStrengthBar ──────────────────────────────────────────────────────

const PasswordStrengthBar = ({ score }) => {
  const meta = STRENGTH_META[score];
  return (
    <div className="mt-2.5 space-y-1.5">
      {/* 4-segment bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((seg) => (
          <div
            key={seg}
            className={[
              'h-1 flex-1 rounded-full transition-all duration-300',
              score >= seg ? meta.barColor : 'bg-gray-200',
            ].join(' ')}
          />
        ))}
      </div>
      {/* Label */}
      {score > 0 && (
        <span className={`text-xs font-medium ${meta.textColor}`}>
          {meta.label} password
        </span>
      )}
    </div>
  );
};

// ─── PasswordRuleList ─────────────────────────────────────────────────────────

const PasswordRuleList = ({ passing }) => (
  <ul className="mt-2 space-y-1">
    {RULES.map((rule, i) => (
      <li
        key={rule.id}
        className={[
          'flex items-center gap-1.5 text-xs transition-colors duration-200',
          passing[i] ? 'text-emerald-600' : 'text-gray-400',
        ].join(' ')}
      >
        <span
          className={[
            'inline-flex items-center justify-center w-3.5 h-3.5 rounded-full transition-all duration-200',
            passing[i]
              ? 'bg-emerald-500 text-white'
              : 'border border-gray-300 text-transparent',
          ].join(' ')}
        >
          <CheckIcon />
        </span>
        {rule.label}
      </li>
    ))}
  </ul>
);

// ─── Signup page ──────────────────────────────────────────────────────────────

const Signup = () => {
  const { register, isAuthenticated } = useAuth();
  const navigate                      = useNavigate();

  const [form, setForm] = useState({
    fullName:        '',
    email:           '',
    password:        '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword]         = useState(false);
  const [showConfirm, setShowConfirm]           = useState(false);
  const [touched, setTouched]                   = useState({});
  const [isLoading, setIsLoading]               = useState(false);
  const [errors, setErrors]                     = useState({});

  // Must be called before any early returns (Rules of Hooks)
  const { score, passing } = usePasswordStrength(form.password);

  // Already logged in — skip signup
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleBlur = (field) => () =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  const validate = () => {
    const e = {};
    if (!form.fullName.trim())              e.fullName        = 'Full name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                            e.email           = 'Enter a valid email address';
    if (score < 2)                          e.password        = 'Password is too weak';
    if (form.password !== form.confirmPassword)
                                            e.confirmPassword = 'Passwords do not match';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      setTouched({ fullName: true, email: true, password: true, confirmPassword: true });
      return;
    }
    setIsLoading(true);
    register(form.fullName, form.email, form.password);
    navigate('/login', { replace: true });
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
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <ShieldIcon />
            </div>
            <span className="text-xl font-semibold tracking-tight text-gray-900">
              VaultIQ
            </span>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 leading-tight mb-2">
              Get started
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Welcome to VaultIQ — let's create your account.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Full name */}
            <Input
              label="Full name"
              type="text"
              placeholder="Jane Doe"
              value={form.fullName}
              onChange={handleChange('fullName')}
              onBlur={handleBlur('fullName')}
              error={touched.fullName ? errors.fullName : ''}
              autoComplete="name"
            />

            {/* Email */}
            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={handleChange('email')}
              onBlur={handleBlur('email')}
              error={touched.email ? errors.email : ''}
              autoComplete="email"
            />

            {/* Password + strength meter */}
            <div>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange('password')}
                onBlur={handleBlur('password')}
                error={touched.password && score < 2 && form.password ? errors.password : ''}
                autoComplete="new-password"
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
              />

              {/* Strength bar — only shown when user has started typing */}
              {form.password.length > 0 && (
                <>
                  <PasswordStrengthBar score={score} />
                  <PasswordRuleList passing={passing} />
                </>
              )}
            </div>

            {/* Confirm password */}
            <Input
              label="Confirm password"
              type={showConfirm ? 'text' : 'password'}
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={handleChange('confirmPassword')}
              onBlur={handleBlur('confirmPassword')}
              error={touched.confirmPassword ? errors.confirmPassword : ''}
              autoComplete="new-password"
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded"
                >
                  {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              }
            />

            {/* Terms notice */}
            <p className="text-xs text-gray-400 leading-relaxed pt-0.5">
              By signing up you agree to our{' '}
              <button type="button" className="text-gray-600 underline underline-offset-2 hover:text-gray-800 transition-colors bg-transparent border-none p-0 cursor-pointer">
                Terms of Service
              </button>{' '}
              and{' '}
              <button type="button" className="text-gray-600 underline underline-offset-2 hover:text-gray-800 transition-colors bg-transparent border-none p-0 cursor-pointer">
                Privacy Policy
              </button>.
            </p>

            <div className="pt-1">
              <Button type="submit" isLoading={isLoading}>
                Create account
              </Button>
            </div>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-gray-500 mt-7">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Sign in
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

export default Signup;
