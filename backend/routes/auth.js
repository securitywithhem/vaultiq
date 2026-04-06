/**
 * @file auth.js
 * @description Authentication routes (register, login, me)
 * @dependencies express, jsonwebtoken, supabase, auth middleware
 * @exports router
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    if (!fullName || typeof fullName !== 'string') {
      return res.status(400).json({ error: 'Full name is required' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      return res.status(400).json({ error: authError.message });
    }

    const user = {
      id: authData.user.id,
      email: authData.user.email,
      fullName: fullName
    };

    // Create short-lived access token (1 hour)
    const token = jwt.sign({ sub: user.id, email: user.email, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    // Create refresh token (7 days)
    const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Set httpOnly, Secure cookies instead of returning token in JSON
    res.cookie('vaultiq_access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60, // 1 hour
      path: '/'
    });

    res.cookie('vaultiq_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    return res.status(201).json({ data: { user } }); // Token NOT in response body
  } catch (err) {
    console.error('[auth.register]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Log in existing user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.warn(`[auth.login] Authentication failure for ${email}:`, authError.message);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create short-lived access token (1 hour)
    const token = jwt.sign({ sub: authData.user.id, email: authData.user.email, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    // Create refresh token (7 days)
    const refreshToken = jwt.sign({ sub: authData.user.id, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '7d' });

    const user = {
      id: authData.user.id,
      email: authData.user.email
    };

    // Set httpOnly, Secure cookies instead of returning token in JSON
    res.cookie('vaultiq_access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60, // 1 hour
      path: '/'
    });

    res.cookie('vaultiq_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    return res.status(200).json({ data: { user } }); // Token NOT in response body
  } catch (err) {
    console.error('[auth.login]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Retrieve current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    return res.status(200).json({
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
          created_at: new Date().toISOString()
        }
      }
    });
  } catch (err) {
    console.error('[auth.me]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout user - clear all cookies
router.post('/logout', (req, res) => {
  res.clearCookie('vaultiq_access_token', { path: '/' });
  res.clearCookie('vaultiq_refresh_token', { path: '/' });
  res.status(200).json({ data: { message: 'Logged out successfully' } });
});

// Refresh access token using refresh token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.vaultiq_refresh_token;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token missing' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Look up user to get email for the new access token
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(decoded.sub);
    const email = userData?.user?.email || '';

    // Create new access token with email included
    const newAccessToken = jwt.sign(
      { sub: decoded.sub, email, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('vaultiq_access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60,
      path: '/'
    });

    res.status(200).json({ data: { message: 'Token refreshed' } });
  } catch (err) {
    console.error('[auth.refresh]', err.message);
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

module.exports = router;
