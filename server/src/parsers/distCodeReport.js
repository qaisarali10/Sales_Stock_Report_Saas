// Stock report with a "Dist Code / Company Name / Dist. Name" heading.
//
// Row: Code | Description | Trade Price | Open Stock | Receipt Qty, Bns |
//      Total Stock | Sales Qty, Bns | Return Qty, Bns | Net Sale Qty, Bns |
//      Sale Value | Transfer In, Out | Closing Qty | Stock Value
// Every cell prints (zeros included). "Company Total" prints value totals
// under their columns, so totals are read by column position.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotals } from './totals.js';
import { median, NUMBER_CELL, numberAtColumn, rightEdge, roundToPrintedTotal } from './layoutHelpers.js';

const CELLS = { count: 16, sprice: 0, sqty: 9, sbonus: 10, salvalue: 11, clqty: 14, clvalue: 15 };

export function isDistCodeReport(lines) {
  return lines.some((line) => /^Dist\. Name:/.test(line.text.trim()))
    && lines.some((line) => /\bTrade\b.*\bOpen\b.*\bReceip\b.*\bNet\. Sale\b.*\bClosing Stock\b/.test(line.text));
}

function productCells(line) {
  if (/Total:/i.test(line.text)) return null;
  const lastText = line.words.findLastIndex((word) => /[A-Za-z]/.test(word.text) && !NUMBER_CELL.test(word.text));
  if (lastText < 0 || !/^\d+$/.test(line.words[0].text)) return null;
  const numbers = line.words.slice(lastText + 1);
  if (numbers.length < CELLS.count - 2 || numbers.length > CELLS.count || !numbers.every((word) => NUMBER_CELL.test(word.text))) return null;
  return { name: line.words.slice(1, lastText + 1).map((word) => word.text).join(' '), numbers };
}

export function parseDistCodeLines(lines) {
  const products = lines.map(productCells).filter(Boolean);
  // Column right edges, learned from rows where every cell is printed.
  const columnEdges = Array.from({ length: CELLS.count }, (_, index) => median(products
    .filter((product) => product.numbers.length === CELLS.count)
    .map((product) => rightEdge(product.numbers[index]))));
  const rows = [];
  const unreadable = [];
  const edges = { salvalue: [], clvalue: [] };
  for (const { name, numbers } of products) {
    let cells = numbers;
    if (numbers.length < CELLS.count) {
      // A cell was left blank: place each number in its column by position.
      cells = new Array(CELLS.count).fill(null);
      for (const word of numbers) {
        const nearest = columnEdges.map((edge, index) => ({ index, distance: Math.abs(edge - rightEdge(word)) })).sort((a, b) => a.distance - b.distance)[0];
        if (!nearest || nearest.distance > 12 || cells[nearest.index]) { cells = null; break; }
        cells[nearest.index] = word;
      }
      if (!cells || !cells[CELLS.sprice]) { unreadable.push(name); continue; }
    }
    const value = (field) => (cells[CELLS[field]] ? numberValue(cells[CELLS[field]].text) : null);
    const sprice = value('sprice');
    const sqty = value('sqty') ?? 0;
    // Every printed sale value in this report is quantity x price; a blank one
    // (which the report's own total still includes) is computed the same way.
    const salvalue = value('salvalue') ?? Math.round(sqty * sprice * 100) / 100;
    rows.push(normalizeRow({
      pafk: name,
      sprice,
      sqty,
      sbonus: value('sbonus') ?? 0,
      salvalue,
      clqty: value('clqty') ?? 0,
      clbonus: 0,
      clvalue: value('clvalue') ?? 0,
    }));
    if (cells[CELLS.salvalue]) edges.salvalue.push(rightEdge(cells[CELLS.salvalue]));
    if (cells[CELLS.clvalue]) edges.clvalue.push(rightEdge(cells[CELLS.clvalue]));
  }
  if (unreadable.length) throw new Error(`Stock report has ${unreadable.length} product line(s) that do not match the columns, e.g. "${unreadable[0]}".`);
  if (!rows.length) throw new Error('Stock report contains no recognized rows.');

  const footer = lines.findLast((line) => /^Company Total:/i.test(line.text.trim()));
  const totals = footer ? {
    sale: numberAtColumn([footer], median(edges.salvalue)),
    close: numberAtColumn([footer], median(edges.clvalue)),
  } : null;
  if (totals) {
    roundToPrintedTotal(rows, 'salvalue', 'sqty', totals.sale);
    roundToPrintedTotal(rows, 'clvalue', 'clqty', totals.close);
  }
  return expectTotals(rows, totals);
}

export async function parseDistCodeReport(buffer) {
  return parseDistCodeLines(await extractPdfLines(buffer));
}
