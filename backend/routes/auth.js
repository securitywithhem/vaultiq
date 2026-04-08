/**
 * @file auth.js
 * @description Authentication routes (register, login, me, logout, refresh)
 * @dependencies express, jsonwebtoken, supabase, auth middleware, accountLockout, logger
 * @exports router
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validators/auth.schema');
const { isAccountLocked, recordFailedLogin, clearFailedLogins } = require('../utils/accountLockout');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Cookie Config ──────────────────────────────────────────────────
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/'
};

// ─── POST /register ─────────────────────────────────────────────────
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      logger.warn('Registration failed', { requestId: req.id, email, error: authError.message });
      return res.status(400).json({ error: 'Registration failed' });
    }

    const user = {
      id: authData.user.id,
      email: authData.user.email,
      fullName
    };

    const token = jwt.sign(
      { sub: user.id, email: user.email, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('vaultiq_access_token', token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 1000 });
    res.cookie('vaultiq_refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });

    logger.info('User registered', { requestId: req.id, userId: user.id });
    return res.status(201).json({ data: { user } });
  } catch (err) {
    logger.error('Register error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /login ────────────────────────────────────────────────────
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check account lockout BEFORE attempting authentication
    // We need user ID for lockout check — do a pre-lookup
    const { data: userLookup } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (userLookup?.id) {
      const locked = await isAccountLocked(userLookup.id);
      if (locked) {
        logger.warn('Login blocked — account locked', { requestId: req.id, email });
        return res.status(423).json({ error: 'Account temporarily locked due to too many failed attempts. Try again later.' });
      }
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      logger.warn('Login failed', { requestId: req.id, email, error: authError.message });
      // Record failed login if we found the user
      if (userLookup?.id) {
        await recordFailedLogin(userLookup.id, email);
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Clear failed login attempts on success
    await clearFailedLogins(authData.user.id);

    const user = {
      id: authData.user.id,
      email: authData.user.email
    };

    const token = jwt.sign(
      { sub: user.id, email: user.email, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('vaultiq_access_token', token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 1000 });
    res.cookie('vaultiq_refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });

    logger.info('User logged in', { requestId: req.id, userId: user.id });
    return res.status(200).json({ data: { user } });
  } catch (err) {
    logger.error('Login error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /me ────────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    return res.status(200).json({
      data: {
        user: {
          id: req.user.id,
          email: req.user.email
        }
      }
    });
  } catch (err) {
    logger.error('Get user error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('vaultiq_access_token', { path: '/' });
  res.clearCookie('vaultiq_refresh_token', { path: '/' });
  logger.info('User logged out', { requestId: req.id });
  res.status(200).json({ data: { message: 'Logged out successfully' } });
});

// ─── POST /refresh ──────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.vaultiq_refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token missing' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (jwtErr) {
      logger.warn('Refresh token invalid', { requestId: req.id, error: jwtErr.message });
      // Clear stale cookies
      res.clearCookie('vaultiq_access_token', { path: '/' });
      res.clearCookie('vaultiq_refresh_token', { path: '/' });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Look up user to get email for the new access token
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(decoded.sub);
    const email = userData?.user?.email || '';

    const newAccessToken = jwt.sign(
      { sub: decoded.sub, email, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Rotate refresh token for security (prevents token reuse)
    const newRefreshToken = jwt.sign(
      { sub: decoded.sub, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('vaultiq_access_token', newAccessToken, { ...COOKIE_OPTS, maxAge: 60 * 60 * 1000 });
    res.cookie('vaultiq_refresh_token', newRefreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });

    logger.info('Token refreshed', { requestId: req.id, userId: decoded.sub });
    return res.status(200).json({ data: { message: 'Token refreshed' } });
  } catch (err) {
    logger.error('Refresh error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
