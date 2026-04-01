import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';

import styles from './Auth.module.css';

const Login = () => {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      toast.error('Invalid email or password');
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.leftPanel}>
        <div className={styles.brandDisplay}>
          <div className={styles.lockAnimation}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1>VaultIQ</h1>
          <p>Your files. Encrypted. Yours alone.</p>
        </div>
      </div>

      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          <h2>Welcome Back</h2>
          <p className={styles.subtitle}>Sign in to access your secure vault.</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="email">Email address</label>
              <input 
                id="email"
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password">Password</label>
              <div className={styles.passwordInput}>
                <input 
                  id="password"
                  type={showPassword ? 'text' : 'password'} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button 
                  type="button" 
                  className={styles.togglePwd}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className={styles.submitBtn} 
              disabled={isSubmitting || !email || !password}
            >
              {isSubmitting ? (
                <span className={styles.btnInner}>
                  <LoadingSpinner size="sm" /> 
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className={styles.footerLink}>
            Need an account? <Link to="/register">Create one now</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
