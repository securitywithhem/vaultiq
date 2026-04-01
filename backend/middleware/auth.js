/**
 * @file auth.js
 * @description JWT authentication middleware for API routes
 * @dependencies jsonwebtoken
 * @exports authenticateToken
 */

const jwt = require('jsonwebtoken');

// Validate JWT from Authorization header
function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Token missing' });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.sub, email: decoded.email };
    
    next();
  } catch (err) {
    console.error('[authenticateToken]', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticateToken };
