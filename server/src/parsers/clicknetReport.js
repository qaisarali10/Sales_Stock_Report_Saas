// Clicknet (clicknet.biz) stock reports.
//
// "Sale & Stock Report" (Batch Wise, or with Sale Return columns), e.g.
// H & M PHARMA, Ismail Son's Nankana: every cell printed; rows end with
//   ... | Net Sale Qty | Bonus | Amount | Closing Stock (quantity only)
// The closing value is closing quantity x trade price, which is how the
// report's own Grand Total is computed.
//
// "Sale & Stock Report (Regular) TP", e.g. M.A PHARMA: quantity columns are
// qty | bonus pairs, empty cells are blank, and rows end with
//   ... | Net Sales Qty, Bonus | Value | Balance Qty, Bonus | Value | Today Sale | Return
// Columns are located from the right edges of the numbers in all rows
// (numbers are right-aligned) and anchored on the two "Value" headers.
//
// Both print totals staggered over several lines below the rows; totals are
// read by column position from the last lines.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { clusterEdges, median, NUMBER_CELL, numberAtColumn, rightEdge, roundToPrintedTotal } from './layoutHelpers.js';

const RATE = /^\d[\d,]*\.\d{2}$/;

export function isClicknetReport(lines) {
  return lines.some((line) => /clicknet\.biz/i.test(line.text)) && Boolean(clicknetTemplate(lines));
}

function clicknetTemplate(lines) {
  if (lines.some((line) => /Item Description/.test(line.text) && /\bAmount\b/.test(line.text) && /\bStock$/.test(line.text.trim()))
    && lines.some((line) => /Net Sale/.test(line.text))) return 'amount';
  if (lines.some((line) => /\bT\.P\b/.test(line.text) && /Net Sales/.test(line.text) && /\bValue\b.*\bBalance\b.*\bValue\b/.test(line.text))) return 'regular';
  return null;
}

function nameAndNumbers(line) {
  // Anything that is not a number (including batch codes such as "05136_")
  // belongs to the description part of the row.
  const lastText = line.words.findLastIndex((word) => !NUMBER_CELL.test(word.text));
  if (lastText < 0) return null;
  const numbers = line.words.slice(lastText + 1);
  if (!numbers.every((word) => NUMBER_CELL.test(word.text))) return null;
  return { words: line.words.slice(0, lastText + 1), numbers };
}

function footerTotals(lines, lastProduct, saleEdge, closeEdge) {
  const footer = lines.slice(lastProduct + 1).reverse();
  return { sale: numberAtColumn(footer, saleEdge), close: numberAtColumn(footer, closeEdge) };
}

function parseAmountTemplate(lines) {
  const rows = [];
  const edges = { salvalue: [], clqty: [] };
  let lastProduct = -1;
  lines.forEach((line, index) => {
    if (/Total:/i.test(line.text)) return;
    const parsed = nameAndNumbers(line);
    if (!parsed || parsed.numbers.length < 6) return;
    // The trade price is the first two-decimal number (a batch number may precede it).
    const all = [...parsed.words, ...parsed.numbers];
    const rateIndex = all.findIndex((word) => RATE.test(word.text));
    const tail = parsed.numbers;
    if (rateIndex < 1 || rateIndex >= all.length - 5) return;
    const sprice = numberValue(all[rateIndex].text);
    const clqty = numberValue(tail.at(-1).text);
    const nameWords = all.slice(0, rateIndex).map((word) => word.text).filter((text, position, list) => position === 0 || !/^\d{4,}$/.test(text) || position < list.length - 1);
    rows.push(normalizeRow({
      pafk: nameWords.filter((text) => !/^\d{4,}$/.test(text)).join(' ').replace(/\s+(?:\d+X\d+|\d+'?S|\d+s)$/i, ''),
      sprice,
      sqty: numberValue(tail.at(-4).text),
      sbonus: numberValue(tail.at(-3).text),
      salvalue: numberValue(tail.at(-2).text),
      clqty,
      clbonus: 0,
      clvalue: Math.round(clqty * sprice * 100) / 100,
    }));
    edges.salvalue.push(rightEdge(tail.at(-2)));
    edges.clqty.push(rightEdge(tail.at(-1)));
    lastProduct = index;
  });
  if (!rows.length) throw new Error('Clicknet report contains no recognized rows.');
  const totals = footerTotals(lines, lastProduct, median(edges.salvalue), median(edges.clqty));
  return expectTotals(rows, totals);
}

function parseRegularTemplate(lines) {
  const header = lines.find((line) => /\bT\.P\b/.test(line.text) && /Net Sales/.test(line.text));
  const valueHeaders = header.words.filter((word) => word.text === 'Value').map(rightEdge);
  const products = [];
  lines.forEach((line, index) => {
    if (/Total:|^[A-Z]\s/.test(line.text)) return;
    const parsed = nameAndNumbers(line);
    if (!parsed || !parsed.numbers.length || !RATE.test(parsed.numbers[0].text)) return;
    products.push({ index, name: parsed.words.map((word) => word.text).join(' '), rate: parsed.numbers[0], cells: parsed.numbers.slice(1) });
  });
  if (!products.length) throw new Error('Clicknet report contains no recognized rows.');
  const columns = clusterEdges(products.flatMap((product) => product.cells.map(rightEdge)));
  const nearestColumn = (edge) => columns.reduce((best, column, index) => (Math.abs(column - edge) < Math.abs(columns[best] - edge) ? index : best), 0);
  const saleValue = nearestColumn(valueHeaders[0]);
  const closeValue = nearestColumn(valueHeaders[1]);
  if (saleValue < 2 || closeValue - saleValue !== 3) throw new Error('Clicknet report columns could not be located.');
  const field = { sqty: saleValue - 2, sbonus: saleValue - 1, salvalue: saleValue, clqty: saleValue + 1, clbonus: saleValue + 2, clvalue: closeValue };

  const rows = products.map(({ name, rate, cells }) => {
    const byColumn = new Map(cells.map((word) => [nearestColumn(rightEdge(word)), word]));
    const value = (key) => (byColumn.has(field[key]) ? numberValue(byColumn.get(field[key]).text) : 0);
    return normalizeRow({
      pafk: name,
      sprice: numberValue(rate.text),
      sqty: value('sqty'),
      sbonus: value('sbonus'),
      salvalue: value('salvalue'),
      clqty: value('clqty'),
      clbonus: value('clbonus'),
      clvalue: value('clvalue'),
    });
  });
  const totals = footerTotals(lines, products.at(-1).index, columns[field.salvalue], columns[field.clvalue]);
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale, 'sbonus');
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close, 'clbonus');
  }
  return expectTotals(rows, totals);
}

export function parseClicknetLines(lines) {
  const template = clicknetTemplate(lines);
  if (template === 'amount') return parseAmountTemplate(lines);
  if (template === 'regular') return parseRegularTemplate(lines);
  throw new Error('Clicknet report column header was not found.');
}

export async function parseClicknetReport(buffer) {
  return parseClicknetLines(await extractPdfLines(buffer));
}
