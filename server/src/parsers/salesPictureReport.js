// "SALES PICTURE FROM ... TO ..." reports (AMAN MEDICINE COMPANY,
// CHAUDHRY MEDICINE COMPANY, AL-UBAID MEDICOSE).
//
// Row: Name | [Form] | Pack | Opening Stock | Purch Rece. | Purch Ret. |
//      Total Stock | Net Sales Qty | Bonus Given | Closed Balance |
//      Net Sales Value
// There is no rate/price column and no printed closing VALUE anywhere in the
// report (only a closing quantity "Balance"), so sale price is derived from
// Net Sales Value / Net Sales Qty and closing value from closing qty x that
// price. Only the sale value total can be verified, from the last
// "<group name> <8 numbers>" total line, whose last number is the Net Sales
// Value total.
import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { expectTotal } from './totals.js';
import { NUMBER_CELL, rightEdge } from './layoutHelpers.js';

const FIELD_COUNT = 8; // Opening, Rece, Ret, Total, NetSales, Bonus, Closed, Value

export function isSalesPictureReport(lines) {
  return lines.some((line) => /^SALES\s+PICTURE\b/i.test(line.text.trim()))
    && Boolean(lines.find((line) => /\bOpening\b/.test(line.text) && /\bClosed\b/.test(line.text) && /Net Sales/.test(line.text)));
}

export function parseSalesPictureLines(lines) {
  const header = lines.find((line) => /\bOpening\b/.test(line.text) && /\bClosed\b/.test(line.text) && /Net Sales/.test(line.text));
  if (!header) throw new Error('Sales Picture report column header was not found.');
  const openingWord = header.words.find((word) => word.text === 'Opening');
  // Data columns start at (roughly) the left edge of "Opening"; anything to
  // the left, including a numeric pack code, is part of the product's name.
  const cutoff = openingWord.x - 15;

  const rows = [];
  let lastTotalLine = null;
  for (const line of lines) {
    const numbers = line.words.filter((word) => word.x >= cutoff && NUMBER_CELL.test(word.text));
    if (numbers.length !== FIELD_COUNT || numbers.some((word, index) => index > 0 && rightEdge(numbers[index - 1]) > word.x)) continue;
    const nameWords = line.words.filter((word) => word.x < cutoff);
    const value = (index) => numberValue(numbers[index].text);
    const name = nameWords.map((word) => word.text).join(' ');
    // Group/company subtotal rows share the product columns but carry a
    // group or company name instead of a drug name: either a known keyword
    // such as "TRADING GROUP", or just a single bare word with no
    // dosage/pack marker (e.g. "TREDING") — real product names are always
    // followed by a strength, form or pack token.
    // The unlabelled grand-total row (no name at all) is the most reliable.
    const singleBareWord = nameWords.length === 1 && !/\d/.test(name)
      && !/\b(?:MG|MCG|ML|GM|IU|TAB|TABS|CAP|CAPS|SYP|SYRUP|INJ|SUSP|DROP|S)\b/i.test(name);
    if (!nameWords.length || singleBareWord || /\b(?:TOTAL|GROUP)\b/i.test(name)) {
      lastTotalLine = numbers;
      continue;
    }
    const sqty = value(4);
    const salvalue = value(7);
    const clqty = value(6);
    const sprice = sqty ? Math.round((salvalue / sqty) * 100) / 100 : 0;
    rows.push(normalizeRow({
      pafk: name,
      sprice,
      sqty,
      sbonus: value(5),
      salvalue,
      clqty,
      clbonus: 0,
      clvalue: Math.round(clqty * sprice * 100) / 100,
    }));
  }
  if (!rows.length) throw new Error('Sales Picture report contains no recognized rows.');

  if (lastTotalLine) expectTotal(rows, 'salvalue', numberValue(lastTotalLine[7].text));
  return rows;
}

export async function parseSalesPictureReport(buffer) {
  return parseSalesPictureLines(await extractPdfLines(buffer));
}
