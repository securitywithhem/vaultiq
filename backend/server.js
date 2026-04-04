require('dotenv').config();
/**
 * @file server.js
 * @description Main entry point for the VaultIQ Express backend
 * @dependencies dotenv, express, cors, express-rate-limit, ./routes/*
 * @exports app
 */


const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const csrf = require('csurf');

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const analyticsRoutes = require('./routes/analytics');

const REQUIRED_ENV = [
  'PORT', 'JWT_SECRET', 'ENCRYPTION_KEY', 'SUPABASE_URL', 
  'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'AWS_ACCESS_KEY_ID', 
  'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET_NAME', 
  'HDFS_WEBHDFS_URL', 'AI_SERVICE_URL'
];

REQUIRED_ENV.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

if (process.env.ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
}

const app = express();
const PORT = process.env.PORT || 5000;

// HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://jjtboyfbsbmnmgzeqgxa.supabase.co', 'https://*.amazonaws.com']
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS with environment-based configuration
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true
}));

app.use(require('compression')());
app.use(cookieParser());
app.use(csrf({ cookie: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

app.use(express.json({ limit: '50mb' }));

// Per-endpoint rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts, please try again later' },
  skipSuccessfulRequests: true
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: { error: 'Upload limit exceeded, please try again later' },
  keyGenerator: (req) => req.user?.id || req.ip
});

const fileLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many file operations, please try again later' }
});

// Apply global rate limiter
app.use('/api/', globalLimiter);

// Route Mounts with rate limiting
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/files', fileLimiter, filesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai-detect', uploadLimiter, require('./routes/aiDetector'));

// CSRF Token endpoint
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// System Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('[Global Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

module.exports = app;
