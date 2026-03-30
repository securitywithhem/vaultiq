/**
 * =============================================================
 * VaultIQ — Auth Routes
 * =============================================================
 * POST /api/auth/register — create account, return JWT
 * POST /api/auth/login    — authenticate, return JWT
 * GET  /api/auth/me       — return current user from token
 *
 * Uses Supabase Auth for user management (signUp / signInWithPassword)
 * and mints our own JWT so the frontend uses a single token format.
 * =============================================================
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const getSupabase = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const JWT_EXPIRY = '7d';

/**
 * Generate a signed JWT for the given user.
 */
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.fullName || user.full_name || '',
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: JWT_EXPIRY }
  );
}

// ---------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const supabase = getSupabase();

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for dev
      user_metadata: { full_name: fullName || '' },
    });

    if (authError) {
      // TODO: remove in prod
      console.log('[Auth] Register error:', authError.message);

      if (authError.message?.toLowerCase().includes('already')) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: authError.message });
    }

    const user = {
      id: authData.user.id,
      email: authData.user.email,
      fullName: fullName || '',
    };

    // 2. Optionally insert into a "profiles" table
    try {
      await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          created_at: new Date().toISOString(),
        });
    } catch (profileErr) {
      // Non-critical — profiles table may not exist yet
      // TODO: remove in prod
      console.log('[Auth] Profile insert skipped:', profileErr.message);
    }

    // 3. Sign JWT
    const token = signToken(user);

    return res.status(201).json({ user, token });
  } catch (err) {
    // TODO: remove in prod
    console.error('[Auth] Register crash:', err);
    return res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const supabase = getSupabase();

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // TODO: remove in prod
      console.log('[Auth] Login error:', error.message);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = {
      id: data.user.id,
      email: data.user.email,
    };

    const token = signToken(user);

    return res.status(200).json({ user, token });
  } catch (err) {
    // TODO: remove in prod
    console.error('[Auth] Login crash:', err);
    return res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// ---------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = {
      id: req.user.id,
      email: req.user.email,
      created_at: req.user.iat
        ? new Date(req.user.iat * 1000).toISOString()
        : null,
    };

    return res.status(200).json({ user });
  } catch (err) {
    // TODO: remove in prod
    console.error('[Auth] /me crash:', err);
    return res.status(500).json({ error: 'Failed to get user info' });
  }
});

module.exports = router;
