// Verification of parsed rows against the totals printed in the source report.
//
// Parsers used to "reconcile" by adding any difference to the last row, which
// made the Excel totals look right while individual product rows were wrong.
// Parsers now only *record* the printed totals they read; rows are never
// modified. The totals are then checked, and a mismatch fails the conversion
// instead of silently producing a wrong workbook.

// Reports print each row's value rounded to whole rupees but compute their
// totals from unrounded values, so the sum of printed rows drifts by up to 0.5
// per row. Those errors largely cancel: allow sqrt(rows) rupees (at least 1),
// e.g. about 7 for 50 rows, which still catches any real missed or misread row.
// Report formats that truncate each row instead (102929.90 -> 102929), and
// print no rate to re-round from, always sum below the printed total by less
// than 1 rupee per row; their parsers declare this with `truncated`.
function withinTolerance(rows, field, parsed, printed, truncated = false) {
  const counted = rows.filter((row) => Number(row[field] || 0) !== 0).length;
  const delta = Math.abs(parsed - printed);
  if (delta <= Math.max(1, Math.sqrt(counted))) return true;
  return truncated && parsed < printed && delta < counted;
}

export class TotalsMismatchError extends Error {
  constructor(details) {
    super(details.map(({ field, parsed, printed }) =>
      `${field === 'salvalue' ? 'Sale value' : 'Closing value'} does not match the report: parsed ${format(parsed)}, printed ${format(printed)}`).join('; ') + '.');
    this.details = details;
  }
}

function format(value) {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function sum(rows, field) {
  return Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) * 100) / 100;
}

// Records a printed total for `field` ('salvalue' or 'clvalue') on the rows
// array. `maxDelta` preserves a parser's existing guard for footers it cannot
// read reliably: a larger difference is treated as "not comparable" rather
// than a failure. Small differences are always reported.
export function expectTotal(rows, field, expected, maxDelta = Infinity, { truncated = false } = {}) {
  if (!Array.isArray(rows) || expected === null || expected === undefined || !Number.isFinite(Number(expected))) return rows;
  const entry = truncated ? { value: Number(expected), maxDelta, truncated } : { value: Number(expected), maxDelta };
  const totals = { ...(rows.printedTotals || {}), [field]: entry };
  Object.defineProperty(rows, 'printedTotals', { value: totals, enumerable: false, configurable: true, writable: true });
  return rows;
}

export function expectTotals(rows, totals, maxDelta = Infinity, options = {}) {
  if (!totals) return rows;
  expectTotal(rows, 'salvalue', totals.sale, maxDelta, options);
  expectTotal(rows, 'clvalue', totals.close, maxDelta, options);
  return rows;
}

export function hasExpectedTotals(rows) {
  return Boolean(rows?.printedTotals && Object.keys(rows.printedTotals).length);
}

// Returns the list of mismatches (empty when the rows agree with every
// comparable printed total, or when no totals were recorded).
export function totalsMismatches(rows) {
  const mismatches = [];
  for (const [field, { value, maxDelta, truncated }] of Object.entries(rows?.printedTotals || {})) {
    const parsed = sum(rows, field);
    const delta = Math.abs(parsed - value);
    if (!withinTolerance(rows, field, parsed, value, truncated) && delta <= maxDelta) mismatches.push({ field, parsed, printed: value });
  }
  return mismatches;
}

// 'verified'   every printed total that was read matches the rows
// 'mismatch'   a comparable printed total differs from the rows
// 'unverified' no printed total was read, or it was too far off to compare
export function totalsStatus(rows) {
  const entries = Object.entries(rows?.printedTotals || {});
  if (!entries.length) return 'unverified';
  if (totalsMismatches(rows).length) return 'mismatch';
  // A printed total of 0 proves nothing: an empty column read by the parser
  // and an empty column read from the footer "agree" trivially.
  if (entries.some(([, { value }]) => value === 0)) return 'unverified';
  const allMatch = entries.every(([field, { value, truncated }]) => withinTolerance(rows, field, sum(rows, field), value, truncated));
  return allMatch ? 'verified' : 'unverified';
}

export function assertTotals(rows) {
  const mismatches = totalsMismatches(rows);
  if (mismatches.length) throw new TotalsMismatchError(mismatches);
  return rows;
}
