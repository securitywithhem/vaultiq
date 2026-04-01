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

app.options('*', cors());
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true
}));

app.use(require('compression')());

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

app.use(express.json({ limit: '50mb' }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
}));

// Route Mounts
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/analytics', analyticsRoutes);

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
