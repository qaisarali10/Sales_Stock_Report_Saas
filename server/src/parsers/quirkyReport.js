// Quirky Tech "Sale And Stock Report" (e.g. AL AZIZ DISTRIBUTOR - ABBOTTABAD).
//
// Header: Item Description | Rate | Pack | Opening Balance | Purchase | Return |
//         Total | Net Sales | Bonus | Value | Adjustment | Closing Balance |
//         Closing Value | [Today Sale | Today Return]
//
// Every stock-quantity column before "Net Sales", plus Adjustment and Closing
// Balance, is printed as two cells: regular quantity | free-goods quantity
// (e.g. "2 -"). Free goods are printed on their own line with "-" as the rate.
// Each product line therefore ends with a fixed number of cells, which are
// read from the end of the line so that packs such as "100 ml", "2*10s" or an
// empty pack cannot shift the columns.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { cellValue, median, numberAtColumn, rightEdge, roundToPrintedTotal } from './layoutHelpers.js';

export { roundToPrintedTotal };

const CELL = /^(?:-|-?\d[\d,]*(?:\.\d+)?)$/;
const RATE = /^(?:-|\d[\d,]*\.\d+)$/;
// Item code followed by a name; total rows can print their numbers on a line
// of their own, which must not be mistaken for a product.
const PRODUCT_LINE = /^\d{4,}\s+[^\s\d-][^\s]*/;
const TOTAL_LINE = /^(?:Total For (?:Group|Company)|Report Total)\b/i;

const HEADER = (line) => /Item Description/i.test(line.text) && /\bRate\b/i.test(line.text)
  && /\bBalance\b/i.test(line.text) && /\bValue\b.*\bValue\b/i.test(line.text);

export function isQuirkySaleStockReport(text) {
  return /Sale And Stock Report/i.test(text) && /Quirky/i.test(text);
}

// Builds the cell layout from the column header. Report versions differ in
// their sale columns ("Net Sales | Bonus | Value", "Sale | Return | Total |
// Value", "... | FOC | Total | Value"), the Pack column is optional, and the
// Adjustment / Today columns may be absent. In every version:
//   - quantity columns print two cells (qty | free goods), except Net Sales,
//     Bonus and FOC; Value columns and the trailing Today Sale / Today Return
//     print one cell;
//   - the first Value is the sale value and the second the closing value;
//   - net sale quantity is the column group just before the first Value
//     (Net Sales + Bonus, or the paired sale "Total"), and closing quantity is
//     the pair just before the second Value.
export function quirkyLayout(lines) {
  const header = lines.find(HEADER);
  if (!header) return null;
  const labels = header.words.map((word) => word.text.trim()).filter(Boolean);
  const rate = labels.findIndex((label) => /^Rate$/i.test(label));
  if (rate < 0) return null;
  const columns = labels.slice(rate + 1).filter((label) => !/^Pack$/i.test(label));
  const valueIndexes = columns.map((label, index) => (/^Value$/i.test(label) ? index : -1)).filter((index) => index >= 0);
  if (valueIndexes.length < 2) return null;
  const [saleValue, closeValue] = valueIndexes;

  const cells = [];
  const start = [];
  columns.forEach((label, index) => {
    const today = index > closeValue; // Today Sale / Today Return
    const single = today || /^(?:Value|Net Sales|Bonus|FOC)$/i.test(label);
    start[index] = cells.length;
    cells.push(index);
    if (!single) cells.push(index);
  });

  const paired = (index) => start[index + 1] - start[index] === 2 || (index === columns.length - 1 && cells.length - start[index] === 2);
  const saleColumn = saleValue - 1;
  let sqty;
  let sbonus;
  if (/^Bonus$/i.test(columns[saleColumn]) && /^Net Sales$/i.test(columns[saleColumn - 1] || '')) {
    sqty = start[saleColumn - 1];
    sbonus = start[saleColumn];
  } else if (paired(saleColumn)) {
    sqty = start[saleColumn];
    sbonus = start[saleColumn] + 1;
  } else return null;
  const closeColumn = closeValue - 1;
  if (!paired(closeColumn)) return null;
  return {
    cellCount: cells.length,
    sqty,
    sbonus,
    salvalue: start[saleValue],
    clqty: start[closeColumn],
    clbonus: start[closeColumn] + 1,
    clvalue: start[closeValue],
  };
}

// Reads the "Report Total" (or last "Total For Company") line by column
// position rather than by counting numbers, because empty totals print "-".
// Some versions print quantity totals on the labelled line and the rupee
// totals on an unlabelled line directly below it; both are searched.
function printedTotals(lines, columnEdges) {
  const index = lines.findLastIndex((item) => /^Report Total/i.test(item.text));
  const at = index >= 0 ? index : lines.findLastIndex((item) => /^Total For Company/i.test(item.text));
  if (at < 0) return null;
  const candidates = [lines[at]];
  const next = lines[at + 1];
  if (next && next.page === lines[at].page && next.words.every((word) => CELL.test(word.text))) candidates.push(next);
  return { sale: numberAtColumn(candidates, columnEdges.salvalue), close: numberAtColumn(candidates, columnEdges.clvalue) };
}

export function parseQuirkyLines(lines) {
  const layout = quirkyLayout(lines);
  if (!layout) throw new Error('Quirky report column header was not found.');

  const rows = [];
  const unreadable = [];
  const edges = { salvalue: [], clvalue: [] };
  for (const line of lines) {
    if (!PRODUCT_LINE.test(line.text) || TOTAL_LINE.test(line.text)) continue;
    const words = line.words;
    const cells = words.slice(-layout.cellCount);
    const prefix = words.slice(0, -layout.cellCount);
    let rateIndex = -1;
    for (let index = prefix.length - 1; index >= 1; index -= 1) {
      if (RATE.test(prefix[index].text)) { rateIndex = index; break; }
    }
    if (cells.length < layout.cellCount || !cells.every((word) => CELL.test(word.text)) || rateIndex < 1) {
      unreadable.push(line.text);
      continue;
    }

    const pafk = prefix.slice(0, rateIndex).map((word) => word.text).join(' ').replace(/^\d{4,}\s+/, '').trim();
    const value = (field) => cellValue(cells[layout[field]]);
    const row = normalizeRow({
      pafk,
      sprice: prefix[rateIndex].text === '-' ? 0 : numberValue(prefix[rateIndex].text),
      sqty: value('sqty'),
      sbonus: value('sbonus'),
      salvalue: value('salvalue'),
      clqty: value('clqty'),
      clbonus: value('clbonus'),
      clvalue: value('clvalue'),
    });
    for (const field of ['salvalue', 'clvalue']) {
      const cell = cells[layout[field]];
      if (cell.text !== '-') edges[field].push(rightEdge(cell));
    }
    if (row.sprice || row.sqty || row.sbonus || row.salvalue || row.clqty || row.clbonus || row.clvalue) rows.push(row);
  }

  if (unreadable.length) {
    throw new Error(`Quirky report has ${unreadable.length} product line(s) that do not match the column layout, e.g. "${unreadable[0]}".`);
  }
  if (!rows.length) throw new Error('Quirky report contains no product rows.');
  const totals = printedTotals(lines, { salvalue: median(edges.salvalue), clvalue: median(edges.clvalue) });
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale, 'sbonus');
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close, 'clbonus');
  }
  return expectTotals(rows, totals);
}

// Quirky Tech "Stock" report with Misc In/Out and Day Sale columns (e.g.
// IBRAHIM DISTRIBUTORS). Every column is a single cell:
//   Opening | Misc In | Misc Out | Receipt | Total | Gross Sale | Sale Return |
//   free goods | Net Sale | Sale Value | Day Sale | Day Value | Balance | Stock Value
// Free goods print on their own line with "-" as the rate. The Report Total
// line prints the sale value total under the Net Sale column and the closing
// value total under Stock Value.
const STOCK_HEADER_TOP = /^Opening Misc Misc Stock Total Gross Sale Net Sale Day Day Balance Stock$/i;
const STOCK_CELLS = { count: 14, sbonus: 7, sqty: 8, salvalue: 9, clqty: 12, clvalue: 13 };

export function isQuirkyStockReport(lines) {
  return lines.some((line) => STOCK_HEADER_TOP.test(line.text.trim()));
}

export function parseQuirkyStockLines(lines) {
  if (!isQuirkyStockReport(lines)) throw new Error('Quirky stock report column header was not found.');
  const rows = [];
  const unreadable = [];
  const edges = { sqty: [], clvalue: [] };
  for (const line of lines) {
    if (!PRODUCT_LINE.test(line.text) || TOTAL_LINE.test(line.text)) continue;
    const cells = line.words.slice(-STOCK_CELLS.count);
    const prefix = line.words.slice(0, -STOCK_CELLS.count);
    if (cells.length < STOCK_CELLS.count || prefix.length < 2 || !cells.every((word) => CELL.test(word.text)) || !RATE.test(prefix.at(-1).text)) {
      unreadable.push(line.text);
      continue;
    }
    const value = (field) => cellValue(cells[STOCK_CELLS[field]]);
    const row = normalizeRow({
      pafk: prefix.slice(0, -1).map((word) => word.text).join(' ').replace(/^\d{4,}\s+/, '').trim(),
      sprice: prefix.at(-1).text === '-' ? 0 : numberValue(prefix.at(-1).text),
      sqty: value('sqty'),
      sbonus: value('sbonus'),
      salvalue: value('salvalue'),
      clqty: value('clqty'),
      clbonus: 0,
      clvalue: value('clvalue'),
    });
    for (const field of ['sqty', 'clvalue']) edges[field].push(rightEdge(cells[STOCK_CELLS[field]]));
    if (row.sprice || row.sqty || row.sbonus || row.salvalue || row.clqty || row.clvalue) rows.push(row);
  }
  if (unreadable.length) {
    throw new Error(`Quirky stock report has ${unreadable.length} product line(s) that do not match the column layout, e.g. "${unreadable[0]}".`);
  }
  if (!rows.length) throw new Error('Quirky stock report contains no product rows.');
  const totals = printedTotals(lines, { salvalue: median(edges.sqty), clvalue: median(edges.clvalue) });
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale);
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close);
  }
  return expectTotals(rows, totals);
}

export async function parseQuirkyReport(buffer) {
  const lines = await extractPdfLines(buffer);
  return isQuirkyStockReport(lines) ? parseQuirkyStockLines(lines) : parseQuirkyLines(lines);
}
