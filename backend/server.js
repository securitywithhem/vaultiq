require('dotenv').config();
/**
 * @file server.js
 * @description Main entry point for the VaultIQ Express backend
 * @dependencies dotenv, express, cors, express-rate-limit, helmet, compression, cookie-parser
 * @exports app
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const logger = require('./utils/logger');
const { requestIdMiddleware } = require('./middleware/requestId');

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const aiDetectionRoutes = require('./routes/aiDetection');
const analyticsRoutes = require('./routes/analytics');
const collectionsRouter = require('./routes/collections');
const submissionsRouter = require('./routes/submissions');

// ─── Environment Validation ─────────────────────────────────────────
const REQUIRED_ENV = [
  'PORT', 'JWT_SECRET', 'ENCRYPTION_KEY', 'SUPABASE_URL',
  'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET_NAME',
  'HDFS_WEBHDFS_URL', 'AI_SERVICE_URL'
];

const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.ENCRYPTION_KEY.length !== 64) {
  logger.error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  process.exit(1);
}

if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
  logger.error('ENCRYPTION_KEY must be valid 64-character hexadecimal');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  logger.error('JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

if (process.env.NODE_ENV !== 'test') {
  try {
    const supabaseUrl = new URL(process.env.SUPABASE_URL);
    if (!supabaseUrl.protocol.startsWith('https')) {
      throw new Error('Must use HTTPS');
    }
  } catch {
    logger.error('SUPABASE_URL must be a valid HTTPS URL');
    process.exit(1);
  }
}

// ─── Express App ─────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

// ─── HTTPS Redirect (Production) ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// ─── Security Headers ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.SUPABASE_URL, 'https://*.amazonaws.com']
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ─── CORS ────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'X-Request-ID'],
  credentials: true
}));

// ─── Core Middleware ─────────────────────────────────────────────────
app.use(require('compression')());
app.use(cookieParser());
app.use(requestIdMiddleware);
app.use(express.json({ limit: '1mb' }));

// NOTE: csurf removed — CSRF is mitigated by SameSite=Strict cookies + CORS origin check.
// All mutating routes require authenticateToken (JWT in HttpOnly cookie).
// Double-submit cookie pattern is unnecessary with this architecture.

// ─── Rate Limiters ──────────────────────────────────────────────────
const applyRateLimit = (limiter) => process.env.NODE_ENV === 'production' ? limiter : (req, res, next) => next();

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 100 });
const fileLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
const collectionsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const analyticsLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });
const submissionsLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30 });

// ─── Apply Global Rate Limiter ──────────────────────────────────────
app.use('/api/', applyRateLimit(globalLimiter));

// ─── Route Mounts ───────────────────────────────────────────────────
app.use('/api/auth', applyRateLimit(authLimiter), authRoutes);
app.use('/api/files', applyRateLimit(fileLimiter), filesRoutes);
app.use('/api/analytics', applyRateLimit(analyticsLimiter), analyticsRoutes);
app.use('/api/ai-detect', applyRateLimit(uploadLimiter), aiDetectionRoutes);
app.use('/api/collections', applyRateLimit(collectionsLimiter), collectionsRouter);
app.use('/api/share', applyRateLimit(submissionsLimiter), submissionsRouter); // For /api/share/:code endpoints

// ─── System Endpoints ───────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    }
  });
});

// ─── 404 Handler ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ───────────────────────────────────────────
app.use((err, req, res, _next) => {
  const requestId = req.id || 'unknown';

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    logger.warn('CORS rejection', { requestId, origin: req.get('Origin') });
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  // Multer errors (file upload)
  if (err.name === 'MulterError') {
    logger.warn('Multer error', { requestId, code: err.code, message: err.message });
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: 'File upload error' });
  }

  // JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Everything else — log full error server-side, return safe message
  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  res.status(500).json({ error: 'Internal server error' });
});

// ─── Graceful Shutdown ──────────────────────────────────────────────
let server;

function gracefulShutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force kill after 10 seconds
    setTimeout(() => process.exit(1), 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — exiting', { error: err.message, stack: err.stack });
  process.exit(1);
});

// ─── Start Server ───────────────────────────────────────────────────
if (require.main === module) {
  server = app.listen(PORT, () => {
    logger.info(`VaultIQ backend listening on port ${PORT}`, {
      env: process.env.NODE_ENV || 'development'
    });
  });
}

module.exports = { app, server };
