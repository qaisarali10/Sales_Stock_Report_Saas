import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from './config.js';

let embeddedServer;

async function connectMongoose(uri, timeoutMs = config.mongoTimeoutMs) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: timeoutMs });
  return mongoose.connection;
}

async function tryExistingMongo(uri) {
  try {
    return await connectMongoose(uri, Math.min(config.mongoTimeoutMs, 1000));
  } catch {
    await mongoose.disconnect().catch(() => undefined);
    return null;
  }
}

// A different MongoDB already listening on the configured port is silently
// reused, which leaves the app without its distributor catalogue.
async function warnIfEmpty(connection, uri) {
  // countDocuments rather than estimatedDocumentCount: collection metadata can
  // report 0 after an unclean embedded MongoDB shutdown.
  const distributors = await connection.db.collection('distributors').countDocuments({}, { limit: 1 }).catch(() => 0);
  if (!distributors) {
    console.warn(`WARNING: ${uri} has no distributors. Another MongoDB may be using this port; set EMBEDDED_MONGO_PORT and MONGODB_URI to a free port.`);
  }
}

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  let uri = config.mongoUri;
  if (config.embeddedMongo) {
    const existingConnection = await tryExistingMongo(uri);
    if (existingConnection) {
      console.log(`Using existing MongoDB at ${uri}`);
      await warnIfEmpty(existingConnection, uri);
      return existingConnection;
    }

    await Promise.all([
      fs.mkdir(config.embeddedMongoPath, { recursive: true }),
      fs.mkdir(config.embeddedMongoBinaryPath, { recursive: true }),
    ]);
    try {
      const instance = {
        ip: '127.0.0.1',
        dbName: 'pdf_parser',
        dbPath: config.embeddedMongoPath,
        storageEngine: 'wiredTiger',
      };
      if (config.embeddedMongoPort > 0) instance.port = config.embeddedMongoPort;

      embeddedServer = await MongoMemoryServer.create({
        binary: { downloadDir: config.embeddedMongoBinaryPath },
        instance
      });
    } catch (error) {
      embeddedServer = undefined;
      throw error;
    }
    uri = embeddedServer.getUri('pdf_parser');
    console.log(`Embedded MongoDB listening at ${uri}`);
  }
  return connectMongoose(uri);
}

export async function disconnectDatabase() {
  await mongoose.disconnect().catch(() => undefined);
  if (embeddedServer) {
    await embeddedServer.stop({ doCleanup: false }).catch(() => undefined);
    embeddedServer = undefined;
  }
}
