import fs from 'node:fs/promises';
import net from 'node:net';
import { app } from './app.js';
import { config, validateConfig } from './config.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { startRetentionJob } from './services/retention.js';

let httpServer;
let shuttingDown = false;
let stopRetentionJob = () => undefined;

function ensurePortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') reject(new Error(`Port ${config.port} is unavailable. Stop the existing backend before starting another one.`));
      else reject(error);
    });
    probe.listen(config.port, '0.0.0.0', () => probe.close(resolve));
  });
}

function listen() {
  return new Promise((resolve, reject) => {
    httpServer = app.listen(config.port, () => resolve(httpServer));
    httpServer.once('error', reject);
  });
}

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down: ${reason}`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  stopRetentionJob();
  await disconnectDatabase();
  clearTimeout(forceExit);
  process.exit(exitCode);
}

async function start() {
  validateConfig();
  await ensurePortAvailable();
  await Promise.all([
    fs.mkdir(config.uploadsDir, { recursive: true }),
    fs.mkdir(config.savedFilesDir, { recursive: true }),
    connectDatabase()
  ]);
  await listen();
  stopRetentionJob = startRetentionJob();
  httpServer.requestTimeout = config.requestTimeoutMs;
  httpServer.headersTimeout = Math.min(60000, config.requestTimeoutMs);
  httpServer.keepAliveTimeout = 5000;
  console.log(`MERN API listening on http://localhost:${config.port}`);
}

start().catch((error) => {
  console.error('Server startup failed:', error);
  disconnectDatabase().finally(() => process.exit(1));
});

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  void shutdown('uncaughtException', 1);
});
process.once('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  void shutdown('unhandledRejection', 1);
});
