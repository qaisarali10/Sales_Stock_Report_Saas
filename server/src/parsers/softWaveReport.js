// SoftWave "SALE & STOCK REPORT" layout.
//
// Row: code + name | Rate | Opn Qty | Value | Pur Qty | Value | Sale Qty |
//      Value | Bns Qty | Value | Trans. | Exp | Cls Qty | Value
// The footer "Grand Totals Of Companies" (or the last "Total of" line) prints
// value totals under their columns, so totals are read by column position.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { median, NUMBER_CELL, numberAtColumn, rightEdge, roundToPrintedTotal } from './layoutHelpers.js';

// With a Rate column: Rate | Opn Qty, Value | Pur Qty, Value | Sale Qty, Value |
//   Bns Qty, Value | Trans. | Exp | Cls Qty, Value
const WITH_RATE = { count: 13, sprice: 0, sqty: 5, salvalue: 6, sbonus: 7, clqty: 11, clvalue: 12 };
// Without a Rate column ("Opp. Purchases Total Sales ... Close Stock"), after
// an optional Pack: Opp Qty | Pur Qty, Value | Total Qty | Sales Qty, Value |
//   Bonus Qty, Value | Trans. | N.Exp | Close Qty, Value
const WITHOUT_RATE = { count: 12, sprice: null, sqty: 4, salvalue: 5, sbonus: 6, clqty: 10, clvalue: 11 };

function softWaveLayout(lines) {
  if (lines.some((line) => /\bRate\b/.test(line.text) && /\bOpn\b/.test(line.text) && /\bCls\b/.test(line.text))) return WITH_RATE;
  if (lines.some((line) => /\bOpp\./.test(line.text) && /\bSales\b/.test(line.text) && /\bClose\b/.test(line.text))) return WITHOUT_RATE;
  return null;
}

export function isSoftWaveReport(lines) {
  return lines.some((line) => /<<\s*SoftWave\s*>>/i.test(line.text)) && Boolean(softWaveLayout(lines));
}

export function parseSoftWaveLines(lines) {
  const CELLS = softWaveLayout(lines);
  if (!CELLS) throw new Error('SoftWave report column header was not found.');
  const rows = [];
  const edges = { salvalue: [], clvalue: [] };
  for (const line of lines) {
    if (/^Total of|Grand Totals/i.test(line.text)) continue;
    const lastText = line.words.findLastIndex((word) => /[A-Za-z]/.test(word.text) && !NUMBER_CELL.test(word.text));
    if (lastText < 0) continue;
    const numbers = line.words.slice(lastText + 1);
    if (numbers.length !== CELLS.count || !numbers.every((word) => NUMBER_CELL.test(word.text))) continue;
    const value = (field) => numberValue(numbers[CELLS[field]].text);
    // Without a Rate column the price is derived from value / quantity.
    const derivedPrice = value('sqty') ? value('salvalue') / value('sqty') : value('clqty') ? value('clvalue') / value('clqty') : 0;
    const nameWords = line.words.slice(0, lastText + 1).map((word) => word.text);
    if (CELLS.sprice === null && nameWords.length > 1 && /^\d+(?:s|ml|mg|gm)?$/i.test(nameWords.at(-1))) nameWords.pop(); // pack
    const row = normalizeRow({
      pafk: nameWords.join(' ').replace(/^\d+\s+/, '').trim(),
      sprice: CELLS.sprice === null ? Math.round(derivedPrice * 100) / 100 : value('sprice'),
      sqty: value('sqty'),
      sbonus: value('sbonus'),
      salvalue: value('salvalue'),
      clqty: value('clqty'),
      clbonus: 0,
      clvalue: value('clvalue'),
    });
    edges.salvalue.push(rightEdge(numbers[CELLS.salvalue]));
    edges.clvalue.push(rightEdge(numbers[CELLS.clvalue]));
    rows.push(row);
  }
  if (!rows.length) throw new Error('SoftWave report contains no recognized rows.');

  const footer = lines.findLast((line) => /Grand Totals Of Companies/i.test(line.text))
    || lines.findLast((line) => /^Total of/i.test(line.text));
  const totals = footer ? {
    sale: numberAtColumn([footer], median(edges.salvalue)),
    close: numberAtColumn([footer], median(edges.clvalue)),
  } : null;
  // Re-rounding needs a printed rate; derived prices would make it circular.
  if (totals && CELLS.sprice !== null) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale);
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close);
  }
  // Without a rate the report's truncated row values cannot be re-rounded.
  return expectTotals(rows, totals, Infinity, { truncated: CELLS.sprice === null });
}

export async function parseSoftWaveReport(buffer) {
  return parseSoftWaveLines(await extractPdfLines(buffer));
}
