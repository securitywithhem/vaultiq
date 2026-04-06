/**
 * @file auth.js
 * @description JWT authentication middleware for API routes
 * @dependencies jsonwebtoken, logger
 * @exports authenticateToken
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function authenticateToken(req, res, next) {
  try {
    // Try cookie first (primary — HttpOnly, SameSite=Strict)
    let token = req.cookies?.vaultiq_access_token;

    // Fallback to Authorization header (for API clients / Postman)
    if (!token) {
      const authHeader = req.headers['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logger.info('Token expired', { requestId: req.id });
      return res.status(401).json({ error: 'Token expired' });
    }

    if (err.name === 'JsonWebTokenError') {
      logger.warn('Invalid token', { requestId: req.id, error: err.message });
      return res.status(403).json({ error: 'Invalid token' });
    }

    logger.error('Auth middleware error', { requestId: req.id, error: err.message });
    return res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = { authenticateToken };
