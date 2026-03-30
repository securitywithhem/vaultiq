/**
 * =============================================================
 * VaultIQ — JWT Authentication Middleware
 * =============================================================
 * Verifies the Bearer token from the Authorization header.
 * On success, attaches the decoded user payload to req.user.
 * On failure, responds with 401.
 * =============================================================
 */

const jwt = require('jsonwebtoken');

/**
 * Express middleware — authenticate JWT token.
 * Expects: Authorization: Bearer <token>
 * Sets: req.user = { id, email, ... }
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authenticateToken };
