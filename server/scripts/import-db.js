// Import an export produced by export-db.js into a MongoDB server (e.g. Atlas).
// Reads <exportDir>/<database>/<collection>.json and inserts every document,
// preserving _id values. Collections that already contain documents are skipped
// so re-running never duplicates or overwrites data.
//
// Usage: node scripts/import-db.js <mongoUri> [exportDir] [database ...]
//   With no database names, every database folder in exportDir is imported.
import fs from 'node:fs';
import path from 'node:path';
import mongodb from 'mongodb';

const { MongoClient, BSON: { EJSON } } = mongodb;

const [uriArg, exportArg = 'db-export', ...onlyDbs] = process.argv.slice(2);
const uri = uriArg || process.env.TARGET_MONGODB_URI;
if (!uri) {
  console.error('Usage: node scripts/import-db.js <mongoUri> [exportDir] [database ...]');
  process.exit(1);
}
const exportDir = path.resolve(exportArg);
const BATCH_SIZE = 1000;

const dbNames = onlyDbs.length
  ? onlyDbs
  : fs.readdirSync(exportDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
await client.connect();

try {
  for (const dbName of dbNames) {
    const db = client.db(dbName);
    const files = fs.readdirSync(path.join(exportDir, dbName)).filter((file) => file.endsWith('.json'));
    for (const file of files) {
      const collName = path.basename(file, '.json');
      const docs = EJSON.parse(fs.readFileSync(path.join(exportDir, dbName, file), 'utf8'), { relaxed: false });
      const collection = db.collection(collName);
      const existing = await collection.estimatedDocumentCount();
      if (existing > 0) {
        console.log(`${dbName}.${collName}: skipped, target already has ${existing} docs`);
        continue;
      }
      if (!docs.length) {
        await db.createCollection(collName).catch((error) => { if (error.codeName !== 'NamespaceExists') throw error; });
        console.log(`${dbName}.${collName}: 0 docs (empty collection created)`);
        continue;
      }
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        await collection.insertMany(docs.slice(i, i + BATCH_SIZE), { ordered: false });
      }
      const count = await collection.countDocuments();
      console.log(`${dbName}.${collName}: ${count}/${docs.length} docs imported${count === docs.length ? '' : '  <-- MISMATCH'}`);
    }
  }
  console.log('Done.');
} finally {
  await client.close();
}
