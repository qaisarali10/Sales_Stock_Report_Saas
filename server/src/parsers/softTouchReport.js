// SoftTouch I.T Solutions "SALES & STOCK REPORT" (www.isofttouch.com).
//
// Versions differ at the front of the row (optional item code, optional Tax
// column, an extra "Special Rate" sale column) but all end with the same
// columns, so fields are read from the end of the row:
//   ... | Net Sale Qty | Bon | Value | 3 columns (P.R/transfers, or Today
//   Sales and previous-month sales) | Closing Qty | Closing Value
// Grand Total prints value totals under their columns, alongside other
// figures such as previous-month sales, so totals are read by column position.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { median, NUMBER_CELL, numberAtColumn, rightEdge, roundToPrintedTotal } from './layoutHelpers.js';

const FROM_END = { sqty: 8, sbonus: 7, salvalue: 6, clqty: 2, clvalue: 1 };
const MIN_NUMBERS = 17;
const SKIP = /\bTotal\b|Units\s*:|From Date|Page No|Product Name|Qty\.|Powered By|Sign\./i;

export function isSoftTouchReport(lines) {
  return lines.some((line) => /isofttouch|SoftTouch/i.test(line.text))
    && lines.some((line) => /Product Name/i.test(line.text) && /T\.P/i.test(line.text));
}

export function parseSoftTouchLines(lines) {
  const rows = [];
  const edges = { salvalue: [], clvalue: [] };
  for (const line of lines) {
    if (SKIP.test(line.text)) continue;
    const lastText = line.words.findLastIndex((word) => /[A-Za-z]/.test(word.text) && !NUMBER_CELL.test(word.text));
    if (lastText < 0) continue;
    const numbers = line.words.slice(lastText + 1);
    if (numbers.length < MIN_NUMBERS || !numbers.every((word) => NUMBER_CELL.test(word.text))) continue;
    const nameWords = line.words.slice(0, lastText + 1).map((word) => word.text);
    if (nameWords.length > 1 && /^\d+$/.test(nameWords[0])) nameWords.shift(); // item code
    const at = (field) => numbers.at(-FROM_END[field]);
    const row = normalizeRow({
      pafk: nameWords.join(' '),
      sprice: numberValue(numbers[0].text),
      sqty: numberValue(at('sqty').text),
      sbonus: numberValue(at('sbonus').text),
      salvalue: numberValue(at('salvalue').text),
      clqty: numberValue(at('clqty').text),
      clbonus: 0,
      clvalue: numberValue(at('clvalue').text),
    });
    edges.salvalue.push(rightEdge(at('salvalue')));
    edges.clvalue.push(rightEdge(at('clvalue')));
    rows.push(row);
  }
  if (!rows.length) throw new Error('SoftTouch report contains no recognized rows.');

  const grand = lines.findLast((line) => /^Grand Total/i.test(line.text)) || lines.findLast((line) => /^Company Total/i.test(line.text));
  const totals = grand ? {
    sale: numberAtColumn([grand], median(edges.salvalue)),
    close: numberAtColumn([grand], median(edges.clvalue)),
  } : null;
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale, 'sbonus');
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close);
  }
  return expectTotals(rows, totals);
}

export async function parseSoftTouchReport(buffer) {
  return parseSoftTouchLines(await extractPdfLines(buffer));
}
