import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { historyRouter } from './routes/history.js';
import { parseRouter } from './routes/parse.js';
import { requireAuth } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { registeredParserCount } from './parsers/registry.js';
import { Distributor } from './models/Distributor.js';
import { asyncRoute } from './utils/errors.js';

export const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.use(helmet({ crossOriginResourcePolicy: false }));
if (config.clientOrigin) app.use(cors({ origin: config.clientOrigin, credentials: true, exposedHeaders: ['Content-Disposition', 'X-Parsed-Rows', 'X-Request-Id'] }));
app.use((req, res, next) => {
  const supplied = String(req.headers['x-request-id'] || '');
  req.id = /^[a-zA-Z0-9_-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});
morgan.token('request-id', (req) => req.id);
app.use(morgan(config.env === 'production' ? ':remote-addr :method :url :status :response-time ms :request-id' : 'dev'));
app.use(express.json({ limit: '1mb' }));

app.get('/api/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health', asyncRoute(async (_req, res) => res.json({
  status: 'ok',
  stack: 'MERN',
  parserEngine: 'adaptive-pdfjs',
  activeDistributors: await Distributor.countDocuments({ active: true }),
  specializedParserRoutes: registeredParserCount()
})));
app.get('/api/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable', database: ready ? 'connected' : 'disconnected' });
});
app.use('/api/auth', authRouter);
const apiRateLimit = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.apiRateLimit,
  message: 'Too many API requests. Please try again later.',
});
app.use('/api', apiRateLimit, requireAuth, catalogRouter, historyRouter, parseRouter);

if (config.env === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ status: 'error', message: `Route not found: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  const isUploadError = error instanceof multer.MulterError;
  const status = error.status || (isUploadError ? 400 : 500);
  if (status >= 500) console.error(error);
  const message = status >= 500 && config.env === 'production' ? 'Internal server error' : (error.message || 'Internal server error');
  const body = { status: 'error', message };
  if (status < 500 && typeof error.code === 'string') body.code = error.code;
  if (status < 500 && Array.isArray(error.suggestions)) body.suggestions = error.suggestions;
  if (config.env !== 'production' && error.details !== undefined) body.details = error.details;
  res.status(status).json(body);
});
