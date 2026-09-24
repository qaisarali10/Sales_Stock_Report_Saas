// Helpers shared by the column-position parsers (quirkyReport, softTouchReport).
import { numberValue } from './normalize.js';

// "-" (empty cell), "1,234", "-12.50", ".00" (printed without a leading zero)
// or "-1.E+5" (an overflowing cell printed in scientific notation).
export const NUMBER_CELL = /^(?:-|-?\d[\d,]*(?:\.\d+)?|-?\.\d+|-?\d*\.?\d*E[+-]?\d+)$/i;

export function cellValue(word) {
  return word.text === '-' ? 0 : numberValue(word.text);
}

export function rightEdge(word) {
  return word.x + (word.width || 0);
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

// Groups right edges of right-aligned numbers into columns; returns the
// median edge of each column, left to right.
export function clusterEdges(values, tolerance = 5) {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters = [];
  for (const value of sorted) {
    const last = clusters.at(-1);
    if (last && value - last.max <= tolerance) {
      last.max = value;
      last.values.push(value);
    } else clusters.push({ max: value, values: [value] });
  }
  return clusters.map((cluster) => median(cluster.values));
}

export function nearestIndex(values, target) {
  return values.reduce((best, value, index) => (Math.abs(value - target) < Math.abs(values[best] - target) ? index : best), 0);
}

// The number printed in the column whose right edge is `edge` (numbers are
// right-aligned), searched on each of `lines` in order; null when no number
// lies within `tolerance` points of that column.
export function numberAtColumn(lines, edge, tolerance = 12) {
  if (edge === null || edge === undefined) return null;
  for (const line of lines) {
    const word = line.words
      .filter((item) => NUMBER_CELL.test(item.text))
      .map((item) => ({ item, distance: Math.abs(rightEdge(item) - edge) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (word && word.distance <= tolerance) return cellValue(word.item);
  }
  return null;
}

// Reports print each row's value rounded to whole rupees but compute their
// totals from the unrounded quantity x rate, so the printed rows add up to a
// few rupees more or less than the printed total. When every row really is
// quantity x rate, each row is re-rounded down or up (never by more than the
// rounding itself: |value - qty x rate| < 1), taking the largest fractions
// first, so that the rows sum exactly to the printed total. If any row is not
// quantity x rate, or the total is not reachable by rounding alone, the
// printed values are kept unchanged.
// Some report versions value stock including free goods ((qty + bonus) x rate),
// others without; the basis that every row fits is used. A row "fits" when its
// printed value is within 1 rupee of the exact value, which covers reports
// that round (122952.50 -> 122953) and reports that truncate (102929.90 ->
// 102929).
export function roundToPrintedTotal(rows, valueField, qtyField, printed, bonusField = null) {
  if (!Number.isFinite(printed) || !rows.length) return rows;
  const bases = [(row) => row[qtyField]];
  if (bonusField) bases.push((row) => row[qtyField] + row[bonusField]);
  const fits = (basis) => rows.every((row) => Math.abs(Math.round(basis(row) * row.sprice * 100) - row[valueField] * 100) < 100);
  const basis = bases.find(fits);
  if (!basis) return rows;
  const items = rows.map((row) => {
    const cents = Math.round(basis(row) * row.sprice * 100);
    const floor = Math.floor(cents / 100);
    return { row, cents, floor, fraction: cents - floor * 100 };
  });
  // Totals printed with paisa (224,922.11) are the sum of the exact values:
  // use those when they add up to the printed total to the paisa.
  const exactCents = items.reduce((sum, item) => sum + item.cents, 0);
  if (!Number.isInteger(printed) && exactCents === Math.round(printed * 100)) {
    for (const item of items) item.row[valueField] = item.cents / 100;
    return rows;
  }
  const roundUps = printed - items.reduce((sum, item) => sum + item.floor, 0);
  const candidates = items.filter((item) => item.fraction > 0).sort((a, b) => b.fraction - a.fraction);
  if (!Number.isInteger(roundUps) || roundUps < 0 || roundUps > candidates.length) return rows;
  const up = new Set(candidates.slice(0, roundUps));
  for (const item of items) item.row[valueField] = item.floor + (up.has(item) ? 1 : 0);
  return rows;
}
