// Parses every report in a folder with the production pipeline and checks the
// result against the totals printed in each report.
//
//   node scripts/audit-samples.js "<folder>" [report.csv]
//
// Status per file:
//   VERIFIED    parsed sale and closing values match the report's printed totals
//   UNVERIFIED  parsed, but no printed totals could be read to check against
//   SUSPECT     a printed total was read but is far from the parsed value
//   MISMATCH    parsed values differ from the printed totals (conversion would fail)
//   ERROR       the file could not be parsed
import fs from 'node:fs/promises';
import path from 'node:path';
import { getParser } from '../src/parsers/registry.js';
import { parseTabularReport } from '../src/parsers/tabularReport.js';
import { validateParsedRows } from '../src/parsers/validateRows.js';
import { totalsStatus, TotalsMismatchError } from '../src/parsers/totals.js';
import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { matchDistributor } from '../src/services/distributorResolver.js';
import { Distributor } from '../src/models/Distributor.js';
import '../src/models/Company.js';

const folder = path.resolve(process.argv[2] || '.');
const reportPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
const only = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY, 'i') : null;
const names = (await fs.readdir(folder))
  .filter((name) => /\.(?:pdf|xlsx?|jpe?g|png)$/i.test(name) && (!only || only.test(name)))
  .sort(Intl.Collator().compare);

const sum = (rows, field) => Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) * 100) / 100;
const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const results = [];

await connectDatabase();
for (const name of names) {
  const result = { file: name, distributor: '', status: '', rows: 0, salvalue: '', clvalue: '', printedSale: '', printedClose: '', message: '' };
  try {
    const buffer = await fs.readFile(path.join(folder, name));
    const { match } = await matchDistributor(name);
    const distributor = match ? await Distributor.findById(match._id).populate('company').lean() : null;
    result.distributor = distributor ? `${distributor.name} (${distributor.area || '-'}) #${distributor.legacyId}` : '(no distributor match)';
    const parser = /\.xlsx?$/i.test(name) ? parseTabularReport : getParser(distributor);
    const rows = validateParsedRows(await parser(buffer, { filename: name, distributor }));
    const status = totalsStatus(rows);
    Object.assign(result, {
      // A printed total was read but differs too much to count as verified.
      status: status === 'unverified' && rows.printedTotals ? 'SUSPECT' : status.toUpperCase(),
      rows: rows.length,
      salvalue: sum(rows, 'salvalue'),
      clvalue: sum(rows, 'clvalue'),
      printedSale: rows.printedTotals?.salvalue?.value ?? '',
      printedClose: rows.printedTotals?.clvalue?.value ?? '',
    });
  } catch (error) {
    result.status = error instanceof TotalsMismatchError ? 'MISMATCH' : 'ERROR';
    result.message = error.message;
  }
  results.push(result);
  console.log([result.status, result.file, result.distributor, result.rows, result.salvalue, result.printedSale, result.clvalue, result.printedClose, result.message].join('\t'));
}
await disconnectDatabase();

const counts = results.reduce((total, item) => ({ ...total, [item.status]: (total[item.status] || 0) + 1 }), {});
console.log(`\n${results.length} files: ${Object.entries(counts).map(([status, count]) => `${status} ${count}`).join(', ')}`);
if (reportPath) {
  const header = ['status', 'file', 'distributor', 'rows', 'salvalue', 'printed sale', 'clvalue', 'printed closing', 'message'];
  const lines = results.map((item) => [item.status, item.file, item.distributor, item.rows, item.salvalue, item.printedSale, item.clvalue, item.printedClose, item.message].map(csv).join(','));
  await fs.writeFile(reportPath, [header.join(','), ...lines].join('\r\n'), 'utf8');
  console.log(`Report written to ${reportPath}`);
}
if (results.some((item) => item.status !== 'VERIFIED')) process.exitCode = 1;
