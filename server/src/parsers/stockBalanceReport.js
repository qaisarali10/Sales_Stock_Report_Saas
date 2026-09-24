// "Stock Statement" with "Name of Product | Packing | Rate | Opening Balance |
// Rece. Qty | Net Sale | Sales Value | Bonus Qty | Other Issue | Close.
// Balance" columns (e.g. AL SYED MEDICINE DISTRIBUTORS, PARAMOUNT
// DISTRIBUTORS).
//
// Rows give the closing quantity only; the footer ("Grand Total", or the last
// "Total of") prints values, with the closing value (closing qty x rate) in
// the closing column. Some reports leave empty cells blank, so columns are
// located by clustering the right edges of row numbers and matched to the
// header labels.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { clusterEdges, nearestIndex, NUMBER_CELL, numberAtColumn, rightEdge, roundToPrintedTotal } from './layoutHelpers.js';

const RATE = /^\d[\d,]*\.\d{2}$/;

function header(lines) {
  return lines.find((line) => /^Name of Product/.test(line.text.trim()) && /\bRate\b/.test(line.text) && /\bValue\b/.test(line.text) && /\bIssue\b/.test(line.text));
}

export function isStockBalanceReport(lines) {
  return lines.some((line) => /^Stock Statement$/.test(line.text.trim())) && Boolean(header(lines));
}

export function parseStockBalanceLines(lines) {
  const labels = header(lines).words;
  const labelEdge = (text, occurrence = 0) => rightEdge(labels.filter((word) => word.text === text)[occurrence]);
  const anchors = { sqty: labelEdge('Sale'), salvalue: labelEdge('Value'), sbonus: labelEdge('Qty.', 1), clqty: labelEdge('Balance', 1) };

  const products = [];
  for (const line of lines) {
    if (/Total/i.test(line.text)) continue;
    const rateIndex = line.words.findIndex((word, index) => index >= 1 && RATE.test(word.text)
      && line.words.slice(index + 1).every((next) => NUMBER_CELL.test(next.text)));
    if (rateIndex < 1 || rateIndex === line.words.length - 1) continue;
    const nameWords = line.words.slice(0, rateIndex).map((word) => word.text);
    if (nameWords.length > 1 && /^\d+(?:ML|MG|S|'S)?$/i.test(nameWords.at(-1))) nameWords.pop(); // packing
    products.push({ name: nameWords.join(' '), rate: line.words[rateIndex], cells: line.words.slice(rateIndex + 1) });
  }
  if (!products.length) throw new Error('Stock statement contains no recognized rows.');

  const columns = clusterEdges(products.flatMap((product) => product.cells.map(rightEdge)));
  const field = Object.fromEntries(Object.entries(anchors).map(([key, edge]) => [key, nearestIndex(columns, edge)]));
  if (new Set(Object.values(field)).size !== 4) throw new Error('Stock statement columns could not be located.');

  const rows = products.map(({ name, rate, cells }) => {
    const byColumn = new Map(cells.map((word) => [nearestIndex(columns, rightEdge(word)), word]));
    const value = (key) => (byColumn.has(field[key]) ? numberValue(byColumn.get(field[key]).text) : 0);
    const sprice = numberValue(rate.text);
    const clqty = value('clqty');
    return normalizeRow({
      pafk: name,
      sprice,
      sqty: value('sqty'),
      sbonus: value('sbonus'),
      salvalue: value('salvalue'),
      clqty,
      clbonus: 0,
      clvalue: Math.round(clqty * sprice * 100) / 100,
    });
  });

  const footer = lines.findLast((line) => /Grand Total/i.test(line.text)) || lines.findLast((line) => /^Total of/i.test(line.text));
  const totals = footer ? {
    sale: numberAtColumn([footer], columns[field.salvalue]),
    close: numberAtColumn([footer], columns[field.clqty]),
  } : null;
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale);
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close);
  }
  return expectTotals(rows, totals);
}

export async function parseStockBalanceReport(buffer) {
  return parseStockBalanceLines(await extractPdfLines(buffer));
}
