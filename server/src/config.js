import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();
const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env.NODE_ENV || 'development';
const embeddedMongo = String(process.env.EMBEDDED_MONGO || 'false').toLowerCase() === 'true';

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function trustProxyValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'false' || normalized === 'off' || normalized === '0') return false;
  if (normalized === 'true' || normalized === 'on') return 1;
  const numeric = Number(normalized);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : value;
}

export const config = Object.freeze({
  env,
  // Keep local development away from port 5000, which is commonly occupied by
  // other local APIs. Production explicitly supplies its own PORT.
  port: positiveNumber(process.env.PORT, 5051),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pdf_parser',
  embeddedMongo,
  embeddedMongoPath: path.resolve(here, '../mongo-data'),
  embeddedMongoBinaryPath: path.resolve(here, '../mongo-binaries'),
  // A stable port lets a restarted development server reconnect to the
  // embedded MongoDB process instead of attempting to start a second process
  // against the same persistent data directory.
  embeddedMongoPort: nonNegativeNumber(process.env.EMBEDDED_MONGO_PORT, 27017),
  // Only needed when the client is hosted on a different origin than the API.
  // The bundled client (production) and the Vite proxy (development) are same-origin.
  clientOrigin: process.env.CLIENT_ORIGIN || '',
  maxUploadBytes: positiveNumber(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
  requestTimeoutMs: positiveNumber(process.env.REQUEST_TIMEOUT_MS, 120000),
  mongoTimeoutMs: positiveNumber(process.env.MONGO_TIMEOUT_MS, 10000),
  maxConcurrentParses: positiveNumber(process.env.MAX_CONCURRENT_PARSES, 2),
  parseRateLimit: positiveNumber(process.env.PARSE_RATE_LIMIT, 20),
  apiRateLimit: positiveNumber(process.env.API_RATE_LIMIT, 300),
  authRateLimit: positiveNumber(process.env.AUTH_RATE_LIMIT, 10),
  rateLimitWindowMs: positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  // The landing page and API are public by default in every environment.
  // Set AUTH_REQUIRED=true (with admin credentials) to put them behind a login.
  authRequired: String(process.env.AUTH_REQUIRED ?? 'false').toLowerCase() === 'true',
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionTtlMs: positiveNumber(process.env.SESSION_TTL_HOURS, 12) * 60 * 60 * 1000,
  secureCookies: String(process.env.COOKIE_SECURE ?? (env === 'production')).toLowerCase() === 'true',
  retentionDays: positiveNumber(process.env.RETENTION_DAYS, 30),
  trustProxy: trustProxyValue(process.env.TRUST_PROXY),
  uploadsDir: path.resolve(here, '../uploads'),
  savedFilesDir: path.resolve(here, '../saved-files')
});

export function validateConfig() {
  const errors = [];
  if (config.env === 'production' && config.embeddedMongo) errors.push('EMBEDDED_MONGO must be false in production.');
  if (config.env === 'production' && !process.env.MONGODB_URI) errors.push('MONGODB_URI must be explicitly configured in production.');
  if (config.env === 'production' && config.clientOrigin && !/^https:\/\//i.test(config.clientOrigin)) errors.push('CLIENT_ORIGIN must use HTTPS in production.');
  if (config.env === 'production' && !config.secureCookies) errors.push('COOKIE_SECURE must be true in production.');
  if (config.embeddedMongo && process.execArgv.includes('--watch')) {
    errors.push('Embedded MongoDB cannot run with Node watch mode. Use "npm run dev --prefix server", or set EMBEDDED_MONGO=false and use an external MongoDB instance before enabling watch mode.');
  }
  if (config.authRequired) {
    if (!config.adminUsername) errors.push('ADMIN_USERNAME is required when authentication is enabled.');
    if (config.adminPassword.length < 12) errors.push('ADMIN_PASSWORD must contain at least 12 characters.');
    if (config.sessionSecret.length < 32) errors.push('SESSION_SECRET must contain at least 32 characters.');
  }
  if (errors.length) throw new Error(`Invalid configuration: ${errors.join(' ')}`);
}
