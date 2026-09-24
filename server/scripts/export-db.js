// Export every non-system database on a MongoDB server to Extended JSON files.
// Output: <outDir>/<database>/<collection>.json (one EJSON array per collection),
// which can be re-imported with `mongoimport --jsonArray` or Compass "Import JSON".
//
// Usage: node scripts/export-db.js [mongoUri] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import mongodb from 'mongodb';

const { MongoClient, BSON: { EJSON } } = mongodb;

const uri = process.argv[2] || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const outDir = path.resolve(process.argv[3] || 'db-export');
const SYSTEM_DBS = new Set(['admin', 'config', 'local']);

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
await client.connect();

try {
  const { databases } = await client.db().admin().listDatabases();
  for (const { name: dbName } of databases) {
    if (SYSTEM_DBS.has(dbName)) continue;
    const db = client.db(dbName);
    const dbDir = path.join(outDir, dbName);
    fs.mkdirSync(dbDir, { recursive: true });

    const collections = await db.listCollections({ type: 'collection' }).toArray();
    for (const { name: collName } of collections) {
      if (collName.startsWith('system.')) continue;
      const file = path.join(dbDir, `${collName}.json`);
      const out = fs.createWriteStream(file);
      let count = 0;
      out.write('[\n');
      for await (const doc of db.collection(collName).find()) {
        out.write((count++ ? ',\n' : '') + EJSON.stringify(doc, { relaxed: false }));
      }
      out.write('\n]\n');
      await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
      console.log(`${dbName}.${collName}: ${count} docs -> ${path.relative(process.cwd(), file)}`);
    }
  }
  console.log(`Done. Export written to ${outDir}`);
} finally {
  await client.close();
}
