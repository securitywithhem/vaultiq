/**
 * @file requestId.js
 * @description Attaches a unique request ID to every request and logs request lifecycle
 * @dependencies uuid, logger
 * @exports requestIdMiddleware
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

function requestIdMiddleware(req, res, next) {
  // Use existing X-Request-ID header (from load balancer) or generate new one
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);

  const start = Date.now();

  // Log request start
  logger.info(`→ ${req.method} ${req.path}`, {
    requestId: req.id,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`← ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
      requestId: req.id,
      statusCode: res.statusCode,
      duration
    });
  });

  next();
}

module.exports = { requestIdMiddleware };
