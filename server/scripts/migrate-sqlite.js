// Imports the legacy Django SQLite database into MongoDB.
//
//   node scripts/migrate-sqlite.js [path/to/db.sqlite3] [--dry-run]
//
// The import is idempotent: every record is upserted by its SQLite primary key
// (stored as `legacyId`), so it can be re-run safely. Records created by this
// app (no legacyId) are never modified. Distributors that were previously
// imported but no longer exist in SQLite are deactivated, not deleted, so
// existing history keeps its references.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { Company } from '../src/models/Company.js';
import { Distributor } from '../src/models/Distributor.js';
import { ParseHistory } from '../src/models/ParseHistory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const databasePath = path.resolve(args.find((arg) => !arg.startsWith('--')) || path.resolve(here, '../../db.sqlite3'));

function text(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

// Django stores naive UTC timestamps ("2026-02-07 06:50:12.343689") when
// USE_TZ is enabled. JavaScript dates only keep milliseconds.
function djangoDate(value) {
  const date = new Date(`${String(value).trim().replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1')}Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return date;
}

function readSource(db) {
  const companies = db.prepare('SELECT id, cname FROM Company_company_model ORDER BY id').all();
  const distributors = db.prepare('SELECT id, did, dname, area, subarea, cell, status, companyfk_id FROM Distributor_distributor_model ORDER BY id').all();
  const history = db.prepare('SELECT id, filename, created_at, company_id, distributor_id FROM parse_parsehistory ORDER BY id').all();

  const problems = [];
  const companyIds = new Set(companies.map((row) => row.id));
  const distributorIds = new Set(distributors.map((row) => row.id));
  for (const row of companies) if (!text(row.cname)) problems.push(`Company ${row.id} has no name.`);
  for (const row of distributors) {
    if (!text(row.dname)) problems.push(`Distributor ${row.id} has no name.`);
    if (!Number.isInteger(row.did)) problems.push(`Distributor ${row.id} has an invalid code: ${row.did}.`);
    if (row.companyfk_id !== null && !companyIds.has(row.companyfk_id)) problems.push(`Distributor ${row.id} references missing company ${row.companyfk_id}.`);
  }
  for (const row of history) {
    if (!text(row.filename)) problems.push(`History ${row.id} has no filename.`);
    if (row.distributor_id !== null && !distributorIds.has(row.distributor_id)) problems.push(`History ${row.id} references missing distributor ${row.distributor_id}.`);
    if (row.company_id !== null && !companyIds.has(row.company_id)) problems.push(`History ${row.id} references missing company ${row.company_id}.`);
    try { djangoDate(row.created_at); } catch (error) { problems.push(`History ${row.id}: ${error.message}`); }
  }
  return { companies, distributors, history, problems };
}

async function upsertAll(model, operations) {
  if (!operations.length) return;
  for (let index = 0; index < operations.length; index += 500) {
    await model.bulkWrite(operations.slice(index, index + 500), { ordered: true });
  }
}

async function verify(source) {
  const failures = [];
  const companies = await Company.find({ legacyId: { $ne: null } }).lean();
  const companyByLegacy = new Map(companies.map((item) => [item.legacyId, item]));
  for (const row of source.companies) {
    if (companyByLegacy.get(row.id)?.name !== text(row.cname)) failures.push(`Company ${row.id} does not match.`);
  }

  const distributors = await Distributor.find({ legacyId: { $ne: null } }).lean();
  const distributorByLegacy = new Map(distributors.map((item) => [item.legacyId, item]));
  for (const row of source.distributors) {
    const doc = distributorByLegacy.get(row.id);
    const expectedCompany = row.companyfk_id === null ? null : String(companyByLegacy.get(row.companyfk_id)?._id);
    if (!doc
      || doc.distributorId !== row.did
      || doc.name !== text(row.dname)
      || doc.area !== text(row.area)
      || doc.subarea !== text(row.subarea)
      || doc.cell !== text(row.cell)
      || doc.active !== Boolean(row.status)
      || (doc.company ? String(doc.company) : null) !== expectedCompany) {
      failures.push(`Distributor ${row.id} (${row.dname}) does not match.`);
    }
  }

  const history = await ParseHistory.find({ legacyId: { $ne: null } }).lean();
  const historyByLegacy = new Map(history.map((item) => [item.legacyId, item]));
  for (const row of source.history) {
    const doc = historyByLegacy.get(row.id);
    const expectedDistributor = row.distributor_id === null ? null : String(distributorByLegacy.get(row.distributor_id)?._id);
    const expectedCompany = row.company_id === null ? null : String(companyByLegacy.get(row.company_id)?._id);
    if (!doc
      || doc.filename !== text(row.filename)
      || doc.createdAt.getTime() !== djangoDate(row.created_at).getTime()
      || (doc.distributor ? String(doc.distributor) : null) !== expectedDistributor
      || (doc.company ? String(doc.company) : null) !== expectedCompany) {
      failures.push(`History ${row.id} does not match.`);
    }
  }
  return failures;
}

async function migrate() {
  console.log(`Source: ${databasePath}${dryRun ? ' (dry run — nothing will be written)' : ''}`);
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const source = readSource(db);
  db.close();

  console.log(`Found ${source.companies.length} companies, ${source.distributors.length} distributors, ${source.history.length} history records.`);
  if (source.problems.length) {
    console.error(`Source validation failed (${source.problems.length} problems). Nothing was written.`);
    for (const problem of source.problems.slice(0, 50)) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  await connectDatabase();
  try {
    const sourceDistributorIds = source.distributors.map((row) => row.id);
    const before = {
      companies: await Company.countDocuments({ legacyId: { $ne: null } }),
      distributors: await Distributor.countDocuments({ legacyId: { $ne: null } }),
      history: await ParseHistory.countDocuments({ legacyId: { $ne: null } }),
      appHistory: await ParseHistory.countDocuments({ legacyId: null }),
    };
    const stale = await Distributor.find({ legacyId: { $ne: null, $nin: sourceDistributorIds }, active: true }).lean();
    console.log(`MongoDB before: ${before.companies} companies, ${before.distributors} distributors, ${before.history} imported history, ${before.appHistory} app history records.`);
    console.log(`Distributors no longer in SQLite to deactivate: ${stale.length}${stale.length ? ` (${stale.map((item) => item.name).join(', ')})` : ''}`);
    if (dryRun) return;

    await upsertAll(Company, source.companies.map((row) => ({
      updateOne: { filter: { legacyId: row.id }, update: { $set: { name: text(row.cname) } }, upsert: true },
    })));
    const companyByLegacy = new Map((await Company.find({ legacyId: { $ne: null } }).lean()).map((item) => [item.legacyId, item._id]));

    await upsertAll(Distributor, source.distributors.map((row) => ({
      updateOne: {
        filter: { legacyId: row.id },
        update: { $set: {
          distributorId: row.did,
          name: text(row.dname),
          area: text(row.area),
          subarea: text(row.subarea),
          cell: text(row.cell),
          active: Boolean(row.status),
          company: row.companyfk_id === null ? null : companyByLegacy.get(row.companyfk_id),
        } },
        upsert: true,
      },
    })));
    if (stale.length) await Distributor.updateMany({ _id: { $in: stale.map((item) => item._id) } }, { $set: { active: false } });
    const distributorByLegacy = new Map((await Distributor.find({ legacyId: { $ne: null } }).lean()).map((item) => [item.legacyId, item._id]));

    await upsertAll(ParseHistory, source.history.map((row) => ({
      updateOne: {
        filter: { legacyId: row.id },
        update: {
          $set: {
            filename: text(row.filename),
            createdAt: djangoDate(row.created_at),
            company: row.company_id === null ? null : companyByLegacy.get(row.company_id),
            distributor: row.distributor_id === null ? null : distributorByLegacy.get(row.distributor_id),
          },
          // The legacy system did not record row counts or failures.
          $setOnInsert: { status: 'success', rowCount: null, error: null },
        },
        upsert: true,
      },
    })));

    const failures = await verify(source);
    const after = {
      companies: await Company.countDocuments({ legacyId: { $ne: null } }),
      distributors: await Distributor.countDocuments({ legacyId: { $ne: null } }),
      active: await Distributor.countDocuments({ active: true }),
      history: await ParseHistory.countDocuments({ legacyId: { $ne: null } }),
      appHistory: await ParseHistory.countDocuments({ legacyId: null }),
    };
    console.log(`MongoDB after: ${after.companies} companies, ${after.distributors} distributors (${after.active} active), ${after.history} imported history, ${after.appHistory} app history records.`);
    if (failures.length) {
      console.error(`Verification FAILED for ${failures.length} records:`);
      for (const failure of failures.slice(0, 50)) console.error(`  - ${failure}`);
      process.exitCode = 1;
    } else {
      console.log(`Verification passed: all ${source.companies.length + source.distributors.length + source.history.length} source records match field by field.`);
    }
  } finally {
    await disconnectDatabase();
  }
}

migrate().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exit(1);
});
