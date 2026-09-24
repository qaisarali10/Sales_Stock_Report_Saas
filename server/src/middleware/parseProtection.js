import { config } from '../config.js';
import { createRateLimiter } from './rateLimit.js';

let activeParses = 0;

export const parseRateLimit = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.parseRateLimit,
  message: 'Too many conversion requests. Please try again later.',
});

export function limitConcurrentParses(_req, res, next) {
  if (activeParses >= config.maxConcurrentParses) {
    return res.status(503).json({ status: 'error', message: 'The parser is busy. Please retry shortly.' });
  }
  activeParses += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeParses = Math.max(0, activeParses - 1);
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}
