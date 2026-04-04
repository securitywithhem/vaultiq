/**
 * @file auth.js
 * @description JWT authentication middleware for API routes
 * @dependencies jsonwebtoken
 * @exports authenticateToken
 */

const jwt = require('jsonwebtoken');

// Validate JWT from Authorization header or cookies
function authenticateToken(req, res, next) {
  try {
    // Try to get token from cookie first (recommended)
    let token = req.cookies?.vaultiq_access_token;
    
    // Fallback to Authorization header for API clients
    if (!token) {
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        token = authHeader.split(' ')[1];
      }
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    
    req.user = { id: decoded.sub, email: decoded.email };
    
    next();
  } catch (err) {
    console.error('[authenticateToken]', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticateToken };
