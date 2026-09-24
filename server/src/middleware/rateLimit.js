function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({ windowMs, max, message }) {
  const clients = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of clients) if (value.resetAt <= now) clients.delete(key);
  }, Math.min(windowMs, 60000));
  cleanup.unref();

  return (req, res, next) => {
    const key = clientKey(req);
    const now = Date.now();
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return res.status(429).json({ status: 'error', message });
    }
    next();
  };
}
