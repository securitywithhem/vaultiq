/**
 * @file auth.js
 * @description Authentication routes (register, login, me)
 * @dependencies express, jsonwebtoken, supabase, auth middleware
 * @exports router
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { supabaseAuth } = require('../utils/supabase');
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

    const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
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

    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({ data: { user, token } });
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

    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = {
      id: authData.user.id,
      email: authData.user.email
    };

    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({ data: { user, token } });
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

module.exports = router;
