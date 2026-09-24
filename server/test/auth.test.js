import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function runModule(source, extraEnv = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      EMBEDDED_MONGO: 'false',
      AUTH_REQUIRED: 'true',
      ADMIN_USERNAME: 'production-admin',
      ADMIN_PASSWORD: 'a-strong-production-password',
      SESSION_SECRET: 'a-production-session-secret-with-32-characters',
      ...extraEnv,
    },
  });
}

test('production authentication issues and verifies a signed secure session', () => {
  const result = runModule(`
    import { authenticate, sessionUser, setSessionCookie } from './src/middleware/auth.js';
    if (!authenticate('production-admin', 'a-strong-production-password')) process.exit(2);
    if (authenticate('production-admin', 'wrong-password')) process.exit(3);
    const response = { setHeader(_name, value) { this.cookie = value; } };
    setSessionCookie(response, 'production-admin');
    if (!response.cookie.includes('HttpOnly') || !response.cookie.includes('Secure')) process.exit(4);
    const request = { headers: { cookie: response.cookie.split(';')[0] } };
    if (sessionUser(request)?.username !== 'production-admin') process.exit(5);
  `);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('production configuration rejects embedded MongoDB', () => {
  const result = runModule(`
    import { validateConfig } from './src/config.js';
    try { validateConfig(); process.exit(2); } catch (error) {
      if (!error.message.includes('EMBEDDED_MONGO must be false')) process.exit(3);
    }
  `, { EMBEDDED_MONGO: 'true' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('authentication status endpoint is mounted at the frontend API path', () => {
  const result = runModule(`
    const { app } = await import('./src/app.js');
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    try {
      const { port } = server.address();
      const response = await fetch('http://127.0.0.1:' + port + '/api/auth/status');
      const body = await response.json();
      if (response.status !== 200) process.exitCode = 2;
      else if (body.status !== 'success' || typeof body.authenticated !== 'boolean') process.exitCode = 3;
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  `, { MONGODB_URI: 'mongodb://127.0.0.1:27017/pdf_parser' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
