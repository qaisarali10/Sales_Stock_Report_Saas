import { parseGenericReport } from './genericReport.js';
import { inferPrintedTotals } from './printedTotals.js';
import { extractPdfLines } from './pdfText.js';
import { expectTotals, totalsMismatches, totalsStatus, TotalsMismatchError } from './totals.js';

// Distributor-specific Node parsers can be registered here; without any, the
// generic adaptive parser is used for every distributor.
const registry = new Map();

export function registerParser(distributorIds, parser) {
  for (const id of distributorIds) {
    const key = Number(id);
    if (!registry.has(key)) registry.set(key, parser);
  }
}

// Runs one parser and checks its rows against the report's printed totals.
// Parsers that read their own layout's totals record them on the rows; the
// generic footer detection is used otherwise.
async function attempt(parser, buffer, options, printedTotals) {
  const rows = await parser(buffer, options);
  if (!Array.isArray(rows) || !rows.length) throw new Error('The parser returned no product rows.');
  if (totalsStatus(rows) === 'unverified') {
    // The parser's own footer reading was missing or not comparable; check
    // against the generic footer detection as well.
    const footer = await printedTotals();
    if (footer) {
      const recorded = rows.printedTotals;
      expectTotals(rows, footer);
      if (totalsStatus(rows) !== 'verified') {
        if (recorded) Object.defineProperty(rows, 'printedTotals', { value: recorded, enumerable: false, configurable: true, writable: true });
        else delete rows.printedTotals;
      }
    }
  }
  const mismatches = totalsMismatches(rows);
  if (mismatches.length) throw new TotalsMismatchError(mismatches);
  return rows;
}

export function getParser(distributor) {
  const specializedParser = registry.get(Number(distributor?.legacyId)) || registry.get(Number(distributor?.distributorId));
  return async (buffer, options) => {
    let footer;
    const printedTotals = async () => {
      if (footer === undefined) footer = inferPrintedTotals(await extractPdfLines(buffer));
      return footer;
    };

    const parsers = specializedParser ? [specializedParser, parseGenericReport] : [parseGenericReport];
    const errors = [];
    let unverified = null;
    for (const parser of parsers) {
      try {
        const rows = await attempt(parser, buffer, options, printedTotals);
        // A result proven against the report's printed totals always wins;
        // an unverifiable one is kept only if nothing better is found.
        if (totalsStatus(rows) === 'verified') return rows;
        unverified ??= rows;
      } catch (error) {
        errors.push(error);
      }
    }
    if (unverified) return unverified;
    // Prefer the most informative failure: a totals mismatch explains exactly
    // what is wrong, otherwise report the distributor-specific parser's error.
    throw errors.find((error) => error instanceof TotalsMismatchError) || errors[0];
  };
}

export function registeredParserCount() {
  return registry.size;
}
