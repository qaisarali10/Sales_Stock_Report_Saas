import crypto from 'node:crypto';
import { config } from '../config.js';

const COOKIE_NAME = 'parser_session';

function safeEqual(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left)).digest();
  const rightDigest = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function signature(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function sessionToken(username) {
  const payload = Buffer.from(JSON.stringify({ username, expiresAt: Date.now() + config.sessionTtlMs })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    try {
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    } catch {
      return ['', ''];
    }
  }).filter(([key]) => key));
}

export function sessionUser(req) {
  if (!config.authRequired) return { username: 'public' };
  const token = cookies(req)[COOKIE_NAME];
  if (!token) return null;
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature || !safeEqual(signature(payload), suppliedSignature)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!value.username || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) return null;
    return { username: value.username };
  } catch {
    return null;
  }
}

export function authenticate(username, password) {
  return config.authRequired
    && safeEqual(username, config.adminUsername)
    && safeEqual(password, config.adminPassword);
}

export function setSessionCookie(res, username) {
  const secure = config.secureCookies ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(sessionToken(username))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}${secure}`);
}

export function clearSessionCookie(res) {
  const secure = config.secureCookies ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

export function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  req.user = user;
  next();
}
