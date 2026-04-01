import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import useDocumentTitle from '../hooks/useDocumentTitle';
import styles from './Auth.module.css';

const Register = () => {
  useDocumentTitle('Register | VaultIQ');
  const [formData, setFormData] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [strength, setStrength] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

  // Validate on the fly
  useEffect(() => {
    const { password } = formData;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    setStrength(score);
  }, [formData.password]);

  const validate = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!formData.fullName.trim()) newErrors.fullName = "Full name is required";
    if (!emailRegex.test(formData.email)) newErrors.email = "Valid email is required";
    if (formData.password.length < 8) newErrors.password = "Minimum 8 characters";
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords must match";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
    // clear local error when typing
    if (errors[e.target.id]) {
      setErrors({ ...errors, [e.target.id]: null });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await register(formData.email, formData.password, formData.fullName);
      navigate('/dashboard');
    } catch (err) {
      setErrors({ api: err.response?.data?.error || 'Registration failed' });
      setIsSubmitting(false);
    }
  };

  const strengthColor = () => {
    if (strength === 0) return 'var(--bg-elevated)';
    if (strength <= 2) return 'var(--accent-red)';
    if (strength === 3) return 'var(--accent-amber)';
    return 'var(--accent-green)';
  };

  const strengthLabel = () => {
    if (strength === 0) return '';
    if (strength <= 2) return 'Weak';
    if (strength === 3) return 'Medium';
    return 'Strong';
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
          <h2>Create Account</h2>
          <p className={styles.subtitle}>Start securing your files instantly.</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            {errors.api && <div className={styles.errorText} style={{fontSize: '0.875rem', marginBottom: '8px', textAlign: 'center'}}>{errors.api}</div>}
            
            <div className={styles.inputGroup}>
              <label htmlFor="fullName">Full Name</label>
              <input 
                id="fullName"
                type="text" 
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Jane Doe"
              />
              {errors.fullName && <span className={styles.errorText}>{errors.fullName}</span>}
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="email">Email address</label>
              <input 
                id="email"
                type="email" 
                value={formData.email}
                onChange={handleChange}
                placeholder="you@company.com"
              />
              {errors.email && <span className={styles.errorText}>{errors.email}</span>}
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password">Password</label>
              <div className={styles.passwordInput}>
                <input 
                  id="password"
                  type={showPassword ? 'text' : 'password'} 
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                />
                <button 
                  type="button" 
                  className={styles.togglePwd}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && <span className={styles.errorText}>{errors.password}</span>}
              
              <div className={styles.strengthMeter}>
                {[1, 2, 3, 4].map(seg => (
                  <div 
                    key={seg} 
                    className={styles.strengthSegment} 
                    style={{ backgroundColor: strength >= seg ? strengthColor() : 'var(--bg-elevated)' }}
                  />
                ))}
              </div>
              <span className={styles.strengthText} style={{ color: strengthColor() }}>
                {strengthLabel()}
              </span>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input 
                id="confirmPassword"
                type="password" 
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
              />
              {errors.confirmPassword && <span className={styles.errorText}>{errors.confirmPassword}</span>}
            </div>

            <button 
              type="submit" 
              className={styles.submitBtn} 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className={styles.btnInner}>
                  <LoadingSpinner size="sm" /> 
                  Creating account...
                </span>
              ) : (
                'Sign Up'
              )}
            </button>
          </form>

          <p className={styles.footerLink}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
