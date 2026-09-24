// "... Value @ TP" stock report with a Value-at-TP value column.
//
// Row: Code | Product | Pack | Price | Opening | Purchase | Total(stock) |
//      Return | Sale | F.G. | Bonus | Total(net sale qty) | Value @ TP |
//      Adj. | Closing (qty only, no closing value column)
// Every cell is always printed. The closing value has no column of its own,
// so it is derived as Closing qty x price — confirmed against the report's
// own Grand Total, whose last two numbers are the sale value and (derived)
// closing value totals.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotal } from './totals.js';

const RATE = /^\d[\d,]*\.\d{2}$/;
const FIELD = /^-?\d[\d,]*(?:\.\d+)?$/;
const FIELD_COUNT = 11; // Opening, Purchase, Total, Return, Sale, F.G., Bonus, Total(net), Value, Adj., Closing

export function isValueAtTpReport(lines) {
  return lines.some((line) => /Value\s*@\s*TP/i.test(line.text)) && lines.some((line) => /^Grand Total\s*:/i.test(line.text.trim()));
}

export function parseValueAtTpLines(lines) {
  const rows = [];
  for (const line of lines) {
    if (/Total|Group|Company/i.test(line.text)) continue;
    const words = line.words;
    if (!/^\d+$/.test(words[0]?.text || '')) continue;
    const rateIndex = words.findIndex((word, index) => index >= 2 && RATE.test(word.text));
    if (rateIndex < 2) continue;
    let tail = words.slice(rateIndex + 1);
    if (tail.length === FIELD_COUNT - 1 && tail.every((word) => FIELD.test(word.text))) {
      // The Value cell (currency) is left blank rather than printed as 0 when
      // nothing sold; every other cell, including qty zeros, always prints.
      tail = [...tail.slice(0, 8), { text: '0' }, ...tail.slice(8)];
    }
    if (tail.length !== FIELD_COUNT || !tail.every((word) => FIELD.test(word.text))) continue;
    const value = (index) => numberValue(tail[index].text);
    const sprice = numberValue(words[rateIndex].text);
    const clqty = value(10);
    rows.push(normalizeRow({
      pafk: words.slice(1, rateIndex - 1).map((word) => word.text).join(' '), // drop the pack token before price
      sprice,
      sqty: value(7), // net sale qty (Sale - Return), printed directly
      sbonus: value(6),
      salvalue: value(8),
      clqty,
      clbonus: 0,
      clvalue: Math.round(clqty * sprice * 100) / 100,
    }));
  }
  if (!rows.length) throw new Error('Value @ TP report contains no recognized rows.');

  // The Grand Total's numbers wrap across lines; the main line with 6
  // comma-formatted totals ends with the sale value and closing value totals.
  const index = lines.findLastIndex((line) => /^Grand Total\s*:/i.test(line.text.trim()));
  const totalsLine = index >= 0 ? lines.slice(0, index).reverse().find((line) => (line.text.match(/\d[\d,]*\.\d{2}/g) || []).length === 6) : null;
  if (totalsLine) {
    const numbers = (totalsLine.text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (numbers.length === 6) {
      expectTotal(rows, 'salvalue', numbers[4]);
      expectTotal(rows, 'clvalue', numbers[5]);
    }
  }
  return rows;
}

export async function parseValueAtTpReport(buffer) {
  return parseValueAtTpLines(await extractPdfLines(buffer));
}
