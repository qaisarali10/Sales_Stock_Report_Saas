// Smartinfotech "SALES & STOCK STATEMENT" (Powered By : Smartinfotech).
//
// Row: Code | Product Name | Pack | TP | Opening | Purchase Qty, Bns | Total |
//      Sales Qty, Bns | S/R | B/R | Net Sales QTY | Purchase return P/R, B/R |
//      return / bonus Value column(s) | Closing Qty | Net Sales VALUE | Stock VALUE
// Headers span several lines, empty cells are blank, quantities are centred
// and values right-aligned, so each number is assigned to the header label
// with the nearest centre on the label line that carries S/R and B/R.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { NUMBER_CELL, roundToPrintedTotal } from './layoutHelpers.js';

const RATE = /^\d[\d,]*\.\d{2}$/;
const PACK = /^(?:\d+X\d*|\d+\s*(?:ML|MG|GM|S))$/i;
const center = (word) => word.x + (word.width || 0) / 2;

export function isSmartInfotechReport(lines) {
  return lines.some((line) => /Smartinfotech/i.test(line.text)) && Boolean(smartColumns(lines));
}

function smartColumns(lines) {
  const labelIndex = lines.findIndex((line) => /\bS\/R\b/.test(line.text) && /\bB\/R\b/.test(line.text) && /V A L U E/.test(line.text));
  if (labelIndex < 1) return null;
  const labels = lines[labelIndex].words;
  const rowAbove = lines[labelIndex - 1].words;
  const rowBelow = lines[labelIndex + 1]?.words || [];
  const at = (predicate, from = 0) => labels.findIndex((word, index) => index >= from && predicate(word.text));
  const firstBR = at((text) => text === 'B/R');
  const sqty = at((text) => text === 'QTY', firstBR);
  const salesBonus = firstBR - 2; // "Bns" right before "S/R"
  const clqty = at((text) => text === 'Qty', sqty);
  const salvalue = at((text) => text === 'V A L U E', clqty);
  const clvalue = labels.length - 1;
  if (firstBR < 0 || sqty < 0 || clqty < 0 || salvalue < 0 || labels[salesBonus]?.text !== 'Bns') return null;

  const opening = rowAbove.find((word) => word.text === 'Balance');
  const total = rowAbove.find((word) => word.text === 'QTY');
  const firstQty = labels.find((word) => word.text === 'QTY');
  if (!opening || !firstQty) return null;
  // Every distinct column, left to right, identified by its label centre.
  const columns = [
    { key: 'opening', x: center(opening) },
    ...labels.filter((word) => center(word) > center(opening)).map((word) => ({ key: labels.indexOf(word), x: center(word) })),
    ...(total ? [{ key: 'total', x: center(total) }] : []),
    ...rowBelow.filter((word) => center(word) > center(opening)).map((word, index) => ({ key: `below${index}`, x: center(word) })),
  ];
  return { columns, keys: { sqty, salesBonus, bonusReturn: firstBR, clqty, salvalue, clvalue }, headerEnd: labelIndex + 1 };
}

function assign(numbers, columns) {
  const cells = new Map();
  for (const word of numbers) {
    const nearest = columns.map((column) => ({ column, distance: Math.abs(column.x - center(word)) })).sort((a, b) => a.distance - b.distance)[0];
    if (nearest.distance > 20 || cells.has(nearest.column.key)) return null;
    cells.set(nearest.column.key, word);
  }
  return cells;
}

export function parseSmartInfotechLines(lines) {
  const layout = smartColumns(lines);
  if (!layout) throw new Error('Smartinfotech report column header was not found.');
  const { columns, keys } = layout;
  const rows = [];
  const unreadable = [];
  for (const line of lines) {
    const words = line.words;
    if (!/^\d+$/.test(words[0]?.text || '') || words.length < 4) continue;
    const rateIndex = words.findIndex((word, index) => index >= 2 && RATE.test(word.text));
    if (rateIndex < 2) continue;
    const numbers = words.slice(rateIndex + 1);
    const cells = numbers.every((word) => NUMBER_CELL.test(word.text)) ? assign(numbers, columns) : null;
    if (!cells) {
      unreadable.push(line.text);
      continue;
    }
    const value = (key) => (cells.has(key) ? numberValue(cells.get(key).text) : 0);
    const nameWords = words.slice(1, rateIndex).map((word) => word.text);
    if (nameWords.length > 1 && PACK.test(nameWords.at(-1))) nameWords.pop();
    rows.push(normalizeRow({
      pafk: nameWords.join(' '),
      sprice: numberValue(words[rateIndex].text),
      sqty: value(keys.sqty),
      sbonus: value(keys.salesBonus) - value(keys.bonusReturn),
      salvalue: value(keys.salvalue),
      clqty: value(keys.clqty),
      clbonus: 0,
      clvalue: value(keys.clvalue),
    }));
  }
  if (unreadable.length) throw new Error(`Smartinfotech report has ${unreadable.length} product line(s) that do not match the columns, e.g. "${unreadable[0]}".`);
  if (!rows.length) throw new Error('Smartinfotech report contains no recognized rows.');

  // The last "Total:" line is the report total.
  const footer = lines.findLast((line) => /\bTotal:/.test(line.text));
  let totals = null;
  if (footer) {
    const cells = assign(footer.words.filter((word) => NUMBER_CELL.test(word.text)), columns) || new Map();
    const read = (key) => (cells.has(key) ? numberValue(cells.get(key).text) : null);
    totals = { sale: read(keys.salvalue), close: read(keys.clvalue) };
  }
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale);
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close);
  }
  return expectTotals(rows, totals);
}

export async function parseSmartInfotechReport(buffer) {
  return parseSmartInfotechLines(await extractPdfLines(buffer));
}
