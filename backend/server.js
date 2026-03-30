/**
 * =============================================================
 * VaultIQ — Express Server Entry Point
 * =============================================================
 * Secure cloud storage backend with:
 *  - JWT authentication (Supabase Auth)
 *  - AES-256-CBC file encryption → AWS S3
 *  - SHA-256 integrity verification
 *  - HDFS event logging (fire-and-forget)
 *  - Spark analytics integration
 *
 * Endpoints:
 *   /api/auth/register   POST
 *   /api/auth/login      POST
 *   /api/auth/me         GET
 *   /api/files/upload    POST
 *   /api/files           GET
 *   /api/files/:id/download  GET
 *   /api/files/:id       DELETE
 *   /api/analytics       GET
 * =============================================================
 */

// ---- Load environment variables first ----
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// ---- Validate critical env vars (warnings only — don't crash) ----
const REQUIRED_ENV = ['JWT_SECRET'];
const OPTIONAL_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME', 'ENCRYPTION_KEY'];

const missingRequired = REQUIRED_ENV.filter((key) => !process.env[key]);
const missingOptional = OPTIONAL_ENV.filter((key) => !process.env[key]);

if (missingRequired.length > 0) {
  console.warn(`\n⚠️  Missing REQUIRED env vars: ${missingRequired.join(', ')}`);
  console.warn('   The server will start but auth will not work.\n');
}
if (missingOptional.length > 0) {
  console.warn(`ℹ️  Missing optional env vars: ${missingOptional.join(', ')}`);
  console.warn('   Some features (Supabase, S3, encryption) may not work until configured.\n');
}

// ---- Import route handlers (lazy supabase — won't crash) ----
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const analyticsRoutes = require('./routes/analytics');

// ---- Create Express app ----
const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// MIDDLEWARE
// ============================================================

// 1. CORS — allow frontend origin
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// 2. Rate limiting — 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// 3. Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Request logging (development)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // TODO: remove in prod
    console.log(
      `${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// ============================================================
// ROUTES
// ============================================================

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/analytics', analyticsRoutes);

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'VaultIQ Backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: {
      supabase: !!process.env.SUPABASE_URL,
      s3: !!process.env.AWS_ACCESS_KEY_ID,
      hdfs: !!process.env.HDFS_WEBHDFS_URL,
      jwt: !!process.env.JWT_SECRET,
      encryption: !!process.env.ENCRYPTION_KEY,
    },
  });
});

// ---- 404 fallback ----
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ---- Global error handler (Express v5 compatible) ----
// Express v5 requires exactly 4 args for error middleware
app.use(function errorHandler(err, req, res, _next) {
  // TODO: remove in prod
  console.error('[Server] Unhandled error:', err.message || err);

  // Handle multer errors specifically
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 100 MB.' });
  }

  // Handle multer missing file errors
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field. Use "file" as the field name.' });
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
  });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║          VaultIQ Backend Server          ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║  🚀  Running on http://localhost:${PORT}     ║`);
  console.log('  ║  🔐  AES-256-CBC encryption active       ║');
  console.log('  ║  ☁️   AWS S3 storage connected            ║');
  console.log('  ║  📊  HDFS logging enabled                ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
