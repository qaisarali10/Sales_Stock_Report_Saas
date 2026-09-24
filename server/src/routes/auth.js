import { Router } from 'express';
import { config } from '../config.js';
import { authenticate, clearSessionCookie, sessionUser, setSessionCookie } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

const loginRateLimit = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.authRateLimit,
  message: 'Too many login attempts. Please try again later.',
});

authRouter.get('/status', (req, res) => {
  res.json({
    status: 'success',
    required: config.authRequired,
    authenticated: Boolean(sessionUser(req)),
    maxUploadMb: Math.round(config.maxUploadBytes / 1024 / 1024),
  });
});

authRouter.post('/login', loginRateLimit, (req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');
  if (!authenticate(username, password)) return res.status(401).json({ status: 'error', message: 'Invalid username or password.' });
  setSessionCookie(res, username);
  res.json({ status: 'success', authenticated: true });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ status: 'success', authenticated: false });
});
