/**
 * @file logger.js
 * @description Centralized structured logging with winston
 * @dependencies winston
 * @exports logger
 */

const winston = require('winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format: [timestamp] LEVEL [requestId] message {meta}
const devFormat = printf(({ level, message, timestamp, requestId, ...meta }) => {
  const rid = requestId ? `[${requestId}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] ${level} ${rid} ${message}${metaStr}`;
});

// Production: JSON lines for log aggregation (ELK, CloudWatch, etc.)
const prodFormat = combine(
  timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  errors({ stack: true }),
  winston.format.json()
);

// Development: human-readable colored output
const devCombined = combine(
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  colorize(),
  devFormat
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'vaultiq-backend' },
  format: process.env.NODE_ENV === 'production' ? prodFormat : devCombined,
  transports: [
    new winston.transports.Console()
  ]
});

// Convenience: create a child logger with a request ID
logger.child = function (meta) {
  return winston.createLogger({
    level: this.level,
    defaultMeta: { ...this.defaultMeta, ...meta },
    format: this.format,
    transports: this.transports
  });
};

module.exports = logger;
