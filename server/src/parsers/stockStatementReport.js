// "Sales & Stock Statement for the period from ..." with "Grand Total Disc
// Given" footer (e.g. AAMIR MEDICINE COMPANY, Sangla Hill).
//
// Row: Code | Description | Pack | Price | Opening Qty | Purchases Qty, Bon |
//      Pur.Return Qty, Bon | Total Qty | Sales Qty, Bon | Sale Return Qty, Bon |
//      Net Sales Qty, Value, Bon | Closing Qty, Value | To Date Sale, Return
// Empty cells are blank. Numbers are right-aligned, so columns are located by
// clustering the right edges of all row numbers and anchored on the two
// "Value" headers (net sales value, closing value).
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { clusterEdges, nearestIndex, NUMBER_CELL, numberAtColumn, rightEdge, roundToPrintedTotal } from './layoutHelpers.js';

const RATE = /^\d[\d,]*\.\d{2}$/;

export function isStockStatementReport(lines) {
  return lines.some((line) => /Sales & Stock Statement for the period/i.test(line.text))
    && lines.some((line) => /Grand Total Disc Given/i.test(line.text));
}

export function parseStockStatementLines(lines) {
  const header = lines.find((line) => /\bQty\b.*\bValue\b.*\bValue\b/.test(line.text) && /\bBon\b/.test(line.text));
  if (!header) throw new Error('Stock statement column header was not found.');
  const valueHeaders = header.words.filter((word) => word.text === 'Value').map(rightEdge);

  const products = [];
  for (const line of lines) {
    if (!/^\d+$/.test(line.words[0]?.text || '') || /Total/i.test(line.text)) continue;
    const rateIndex = line.words.findIndex((word, index) => index >= 2 && RATE.test(word.text)
      && line.words.slice(index + 1).every((next) => NUMBER_CELL.test(next.text)));
    if (rateIndex < 2) continue;
    const nameWords = line.words.slice(1, rateIndex).map((word) => word.text);
    if (nameWords.length > 1 && /^\d+'?S$/i.test(nameWords.at(-1))) nameWords.pop(); // pack
    products.push({ name: nameWords.join(' '), rate: line.words[rateIndex], cells: line.words.slice(rateIndex + 1) });
  }
  if (!products.length) throw new Error('Stock statement contains no recognized rows.');

  const columns = clusterEdges(products.flatMap((product) => product.cells.map(rightEdge)));
  const saleValue = nearestIndex(columns, valueHeaders[0]);
  const closeValue = nearestIndex(columns, valueHeaders[1]);
  // Net Sales: Qty | Value | Bon ; Closing: Qty | Value
  const field = { sqty: saleValue - 1, salvalue: saleValue, sbonus: saleValue + 1, clqty: closeValue - 1, clvalue: closeValue };
  if (field.sqty < 0 || field.clqty <= field.sbonus) throw new Error('Stock statement columns could not be located.');

  const rows = products.map(({ name, rate, cells }) => {
    const byColumn = new Map(cells.map((word) => [nearestIndex(columns, rightEdge(word)), word]));
    const value = (key) => (byColumn.has(field[key]) ? numberValue(byColumn.get(field[key]).text) : 0);
    return normalizeRow({
      pafk: name,
      sprice: numberValue(rate.text),
      sqty: value('sqty'),
      sbonus: value('sbonus'),
      salvalue: value('salvalue'),
      clqty: value('clqty'),
      clbonus: 0,
      clvalue: value('clvalue'),
    });
  });

  const footer = lines.findLast((line) => /Grand Total Disc Given/i.test(line.text));
  const totals = footer ? {
    sale: numberAtColumn([footer], columns[field.salvalue]),
    close: numberAtColumn([footer], columns[field.clvalue]),
  } : null;
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale);
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close);
  }
  return expectTotals(rows, totals);
}

export async function parseStockStatementReport(buffer) {
  return parseStockStatementLines(await extractPdfLines(buffer));
}
