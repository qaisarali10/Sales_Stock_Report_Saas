// DevoTech "SALES, STOCK & RETURN REPORT" (www.DevoTech.PK).
//
// Header: ITEM | RATE | OPEN | RCVD | TOTAL | TRANS | LAST MONTH |
//         SALE QTY, BONUS | RETURN QTY, BONUS | NET SALE QTY, BONUS, AMOUNT |
//         CLOSING QTY, AMT
// Empty cells are left blank (no "-" or 0), so every number is assigned to
// the header column whose right edge it lines up with. The footer prints its
// totals staggered over unlabelled lines; totals are read by column position.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { median, NUMBER_CELL, numberAtColumn, rightEdge, roundToPrintedTotal } from './layoutHelpers.js';

const COLUMN_TOLERANCE = 15;

export function isDevoTechReport(lines) {
  return lines.some((line) => /DevoTech/i.test(line.text)) && Boolean(devoTechColumns(lines));
}

// Maps each field to the right edge of its header label.
function devoTechColumns(lines) {
  const header = lines.find((line) => /^ITEM\b/.test(line.text.trim()) && /\bRATE\b/.test(line.text) && /\bAMOUNT\b/.test(line.text));
  if (!header) return null;
  const words = header.words;
  const amount = words.findIndex((word) => word.text === 'AMOUNT');
  const rate = words.findIndex((word) => word.text === 'RATE');
  const closingQty = words.findIndex((word, index) => index > amount && word.text === 'QTY');
  const closingAmount = words.findIndex((word, index) => index > closingQty && /^AMT|AMOUNT$/.test(word.text));
  if (rate < 0 || amount < 2 || closingQty < 0 || closingAmount < 0) return null;
  if (words[amount - 2].text !== 'QTY' || words[amount - 1].text !== 'BONUS') return null;
  const edge = (index) => rightEdge(words[index]);
  return {
    all: words.slice(rate).map(rightEdge),
    fields: { sprice: edge(rate), sqty: edge(amount - 2), sbonus: edge(amount - 1), salvalue: edge(amount), clqty: edge(closingQty), clvalue: edge(closingAmount) },
  };
}

// Assigns each number on the line to its nearest header column.
function cellsByColumn(numbers, columns) {
  const cells = new Map();
  for (const word of numbers) {
    const nearest = columns.all
      .map((edge) => ({ edge, distance: Math.abs(edge - rightEdge(word)) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > COLUMN_TOLERANCE || cells.has(nearest.edge)) return null;
    cells.set(nearest.edge, word);
  }
  return cells;
}

export function parseDevoTechLines(lines) {
  const columns = devoTechColumns(lines);
  if (!columns) throw new Error('DevoTech report column header was not found.');
  const rows = [];
  const unreadable = [];
  const edges = { salvalue: [], clvalue: [] };
  let lastProduct = -1;
  lines.forEach((line, index) => {
    const lastText = line.words.findLastIndex((word) => /[A-Za-z]/.test(word.text) && !NUMBER_CELL.test(word.text));
    if (lastText < 0 || lastText === line.words.length - 1) return;
    const numbers = line.words.slice(lastText + 1);
    if (!numbers.every((word) => NUMBER_CELL.test(word.text)) || !/^\d[\d,]*\.\d+$/.test(numbers[0].text)) return;
    const cells = cellsByColumn(numbers, columns);
    if (!cells || !cells.has(columns.fields.sprice)) {
      unreadable.push(line.text);
      return;
    }
    const value = (field) => (cells.has(columns.fields[field]) ? numberValue(cells.get(columns.fields[field]).text) : 0);
    rows.push(normalizeRow({
      pafk: line.words.slice(0, lastText + 1).map((word) => word.text).join(' '),
      sprice: value('sprice'),
      sqty: value('sqty'),
      sbonus: value('sbonus'),
      salvalue: value('salvalue'),
      clqty: value('clqty'),
      clbonus: 0,
      clvalue: value('clvalue'),
    }));
    for (const field of ['salvalue', 'clvalue']) if (cells.has(columns.fields[field])) edges[field].push(rightEdge(cells.get(columns.fields[field])));
    lastProduct = index;
  });
  if (unreadable.length) throw new Error(`DevoTech report has ${unreadable.length} product line(s) that do not match the columns, e.g. "${unreadable[0]}".`);
  if (!rows.length) throw new Error('DevoTech report contains no recognized rows.');

  // Footer: the numeric lines after the last product row, up to the software line.
  const footer = lines.slice(lastProduct + 1).filter((line) => line.words.length && line.words.every((word) => NUMBER_CELL.test(word.text)));
  const saleEdge = median(edges.salvalue) ?? columns.fields.salvalue;
  const closeEdge = median(edges.clvalue) ?? columns.fields.clvalue;
  const totals = footer.length ? { sale: numberAtColumn(footer.reverse(), saleEdge), close: numberAtColumn(footer, closeEdge) } : null;
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale);
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close);
  }
  return expectTotals(rows, totals);
}

export async function parseDevoTechReport(buffer) {
  return parseDevoTechLines(await extractPdfLines(buffer));
}
