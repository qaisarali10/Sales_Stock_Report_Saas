import { extractPdfLines } from './pdfText.js';
import { normalizeRow, numberValue } from './normalize.js';
import { isQuirkySaleStockReport, isQuirkyStockReport, parseQuirkyLines, parseQuirkyStockLines, quirkyLayout } from './quirkyReport.js';
import { expectTotal } from './totals.js';
import { roundToPrintedTotal } from './layoutHelpers.js';
import { isSoftTouchReport, parseSoftTouchLines } from './softTouchReport.js';
import { isSoftWaveReport, parseSoftWaveLines } from './softWaveReport.js';
import { isDevoTechReport, parseDevoTechLines } from './devoTechReport.js';
import { isSmartInfotechReport, parseSmartInfotechLines } from './smartInfotechReport.js';
import { isDistCodeReport, parseDistCodeLines } from './distCodeReport.js';
import { isClicknetReport, parseClicknetLines } from './clicknetReport.js';
import { isStockStatementReport, parseStockStatementLines } from './stockStatementReport.js';
import { isStockBalanceReport, parseStockBalanceLines } from './stockBalanceReport.js';
import { isSalesPictureReport, parseSalesPictureLines } from './salesPictureReport.js';
import { isNetSaleTransferReport, parseNetSaleTransferLines } from './netSaleTransferReport.js';
import { isValueAtTpReport, parseValueAtTpLines } from './valueAtTpReport.js';

const TOTAL_LINE = /\b(grand|company|report|group|page)?\s*total\b/i;
const HEADER_LINE = /\b(item|product|description)\b.*\b(sale|sales|closing|stock)\b/i;
const DECIMAL = /^-?\d[\d,]*\.\d+$/;
const VALUE = /^[-+]?\(?[\d,.]+(?:\.\d+)?\)?$/;
const PLACEHOLDER = /^(?:-|--|\*+|0)$/;

function values(tokens) {
  return tokens.map((token) => PLACEHOLDER.test(token) ? 0 : numberValue(token));
}

function baseRow(pafk, sprice = 0) {
  return normalizeRow({ pafk: pafk.replace(/^\d+[.)-]?\s*/, '').trim(), sprice });
}

function productLine(line) {
  return line.text && !TOTAL_LINE.test(line.text) && !HEADER_LINE.test(line.text) && !/powered by|print(?:ed)? (?:date|by)|version|from date|to date/i.test(line.text);
}

export function parseQuirky(lines, hasTodayColumns) {
  const rows = [];
  for (const line of lines) {
    if (!productLine(line) || !/^\d{5,}\s/.test(line.text)) continue;
    const tokens = line.text.split(/\s+/);
    const priceIndex = tokens.findIndex((token, index) => index > 1 && DECIMAL.test(token));
    if (priceIndex < 2) continue;
    const tail = values(tokens.slice(priceIndex + 2));
    if (tail.length < (hasTodayColumns ? 14 : 16)) continue;
    const row = baseRow(tokens.slice(1, priceIndex).join(' '), tokens[priceIndex]);
    row.sqty = tail[8] || 0;
    row.sbonus = tail[9] || 0;
    row.salvalue = tail[10] || 0;
    row.clqty = tail[hasTodayColumns ? 11 : 13] || 0;
    row.clvalue = tail[hasTodayColumns ? 13 : 15] || 0;
    rows.push(row);
  }
  return rows;
}

export function parse4M(lines) {
  const rows = [];
  for (const line of lines) {
    if (!productLine(line) || !/^\d{5,}\s/.test(line.text)) continue;
    const tokens = line.text.split(/\s+/);
    const priceIndex = tokens.findIndex((token, index) => index > 1 && DECIMAL.test(token));
    if (priceIndex < 2) continue;
    const tail = values(tokens.slice(priceIndex + 1));
    if (tail.length < 20) continue;
    const row = baseRow(tokens.slice(1, priceIndex).join(' '), tokens[priceIndex]);
    row.sqty = tail[12] || 0;
    row.sbonus = tail[13] || 0;
    row.salvalue = tail[14] || 0;
    row.clqty = tail[17] || 0;
    row.clvalue = tail[19] || 0;
    rows.push(row);
  }
  return rows;
}

// The price is the decimal after which every token is a number, so that
// decimals inside product names ("ALLORX 2.5 MG") are not taken for it.
function priceBeforeNumbers(tokens, minIndex = 1) {
  return tokens.findIndex((token, index) => index >= minIndex && DECIMAL.test(token)
    && tokens.slice(index + 1).every((next) => VALUE.test(next) || PLACEHOLDER.test(next)));
}

function parseClassicStock(lines) {
  const rows = [];
  for (const line of lines) {
    if (!productLine(line)) continue;
    const tokens = line.text.split(/\s+/);
    const priceIndex = priceBeforeNumbers(tokens);
    if (priceIndex < 1) continue;
    const tailTokens = tokens.slice(priceIndex + 1);
    // Opening | Purchase | Sales | Sale Value | [Bonus] | S.E.P. | Closing Stock | Closing Value
    if ((tailTokens.length !== 8 && tailTokens.length !== 7) || !tailTokens.every((token) => VALUE.test(token) || PLACEHOLDER.test(token))) continue;
    const tail = values(tailTokens);
    const withBonus = tail.length === 8;
    const row = baseRow(tokens.slice(0, priceIndex).join(' '), tokens[priceIndex]);
    row.sqty = tail[2];
    row.salvalue = tail[3];
    row.sbonus = withBonus ? tail[4] : 0;
    row.clqty = tail.at(-2);
    row.clvalue = tail.at(-1);
    rows.push(row);
  }
  return rows;
}

function parseClicknet(lines) {
  const rows = [];
  for (const line of lines) {
    if (!productLine(line)) continue;
    const tokens = line.text.split(/\s+/);
    const priceIndex = tokens.findIndex((token, index) => index > 1 && DECIMAL.test(token));
    if (priceIndex < 2) continue;
    const tailTokens = tokens.slice(priceIndex + 1);
    if (tailTokens.length < 10 || !tailTokens.every((token) => VALUE.test(token) || PLACEHOLDER.test(token))) continue;
    const tail = values(tailTokens);
    const row = baseRow(tokens.slice(0, priceIndex - 1).join(' '), tokens[priceIndex]);
    row.sqty = tail[3];
    row.salvalue = tail[4];
    row.sbonus = tail[5];
    row.clqty = tail.at(-2);
    row.clvalue = tail.at(-1);
    rows.push(row);
  }
  return rows;
}

function parseSoftronix(lines) {
  const rows = [];
  for (const line of lines) {
    if (!productLine(line) || !/^[a-z0-9]{4,}\s/i.test(line.text)) continue;
    const tokens = line.text.split(/\s+/);
    if (tokens.length < 15) continue;
    const tailTokens = tokens.slice(-13);
    if (!tailTokens.every((token) => VALUE.test(token) || PLACEHOLDER.test(token))) continue;
    const tail = values(tailTokens);
    const row = baseRow(tokens.slice(1, -13).join(' '));
    row.sqty = tail[8];
    row.sbonus = tail[9];
    row.salvalue = tail[10];
    row.clqty = tail[11];
    row.clvalue = tail[12];
    if (row.sqty && row.salvalue) row.sprice = row.salvalue / row.sqty;
    else if (row.clqty && row.clvalue) row.sprice = row.clvalue / row.clqty;
    rows.push(row);
  }
  return rows;
}

function parseSaleStockV15(lines) {
  const rows = [];
  for (const line of lines) {
    if (!productLine(line) || !/^\d{3,6}\s/.test(line.text)) continue;
    const tokens = line.text.split(/\s+/);
    const priceIndex = tokens.findIndex((token, index) => index > 1 && DECIMAL.test(token));
    if (priceIndex < 2) continue;
    const tailTokens = tokens.slice(priceIndex + 1).filter((token) => VALUE.test(token) || PLACEHOLDER.test(token));
    if (tailTokens.length < 12) continue;
    const tail = values(tailTokens);
    const hasTodayColumns = /Today\s+Today/i.test(lines.map((item) => item.text).join('\n'));
    const row = baseRow(tokens.slice(1, priceIndex).join(' '), tokens[priceIndex]);
    if (hasTodayColumns && tail.length >= 22) {
      row.sqty = tail[12] || 0;
      row.sbonus = tail[13] || 0;
      row.salvalue = tail[14] || 0;
      row.clqty = tail[18] || 0;
      row.clvalue = row.clqty && row.sprice ? Math.round(row.clqty * row.sprice * 100) / 100 : 0;
    } else if (hasTodayColumns && tail.length >= 18) {
      row.sqty = tail[8] || 0;
      row.sbonus = tail[9] || 0;
      row.salvalue = tail[10] || 0;
      row.clqty = tail[13] || 0;
      row.clvalue = tail[15] || 0;
    } else {
      row.sqty = tail.at(-8) || 0;
      row.sbonus = tail.at(-7) || 0;
      row.salvalue = tail.at(-6) || 0;
      row.clqty = tail.at(-3) || 0;
      row.clvalue = tail.at(-1) || 0;
    }
    if (row.sqty || row.sbonus || row.salvalue || row.clqty || row.clvalue) rows.push(row);
  }
  return rows;
}

export function parseSoftWaveStock(lines) {
  const rows = [];
  for (const line of lines) {
    if (!productLine(line) || !/^\d+\s/.test(line.text)) continue;
    const tokens = line.text.split(/\s+/);
    const rateIndex = tokens.findIndex((token, index) => index > 1 && DECIMAL.test(token));
    if (rateIndex < 2) continue;
    const tailTokens = tokens.slice(rateIndex + 1);
    if (tailTokens.length !== 12 || !tailTokens.every((token) => VALUE.test(token) || PLACEHOLDER.test(token))) continue;
    const tail = values(tailTokens);
    const row = baseRow(tokens.slice(1, rateIndex).join(' '), tokens[rateIndex]);
    row.sqty = tail[4];
    row.salvalue = tail[5];
    row.sbonus = tail[6];
    row.clqty = tail[10];
    row.clvalue = tail[11];
    rows.push(row);
  }
  return rows;
}

export function parseNumericTail(lines) {
  const rows = [];
  for (const line of lines) {
    if (!productLine(line)) continue;
    let start = line.words.length;
    while (start > 0 && (VALUE.test(line.words[start - 1].text.replace(/\s/g, '')) || PLACEHOLDER.test(line.words[start - 1].text.replace(/\s/g, '')))) start -= 1;
    const nameWords = line.words.slice(0, start);
    const numbers = line.words.slice(start).map((word) => numberValue(word.text));
    if (!nameWords.length || numbers.length < 3) continue;
    const row = baseRow(nameWords.map((word) => word.text).join(' '));
    if (!/[a-z]/i.test(row.pafk)) continue;
    row.sprice = numbers[0] || 0;
    row.sqty = numbers.length >= 6 ? numbers.at(-5) : numbers.at(-4) || 0;
    row.sbonus = numbers.length >= 6 ? numbers.at(-4) : 0;
    row.salvalue = numbers.length >= 6 ? numbers.at(-3) : numbers.at(-3) || 0;
    row.clqty = numbers.at(-2) || 0;
    row.clvalue = numbers.at(-1) || 0;
    rows.push(row);
  }
  return rows;
}

// Records the printed total for verification. Rows are only re-rounded when
// every row is quantity x price within its printed rounding (see
// roundToPrintedTotal); otherwise they are left exactly as printed.
function reconcileRows(rows, field, expected) {
  if (Number.isFinite(expected)) roundToPrintedTotal(rows, field, field === 'salvalue' ? 'sqty' : 'clqty', expected);
  expectTotal(rows, field, expected);
}

function numbersFrom(value) {
  return (String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}

function reconcilePrintedTotals(rows, lines, family) {
  if (family === 'quirky') {
    const line = [...lines].reverse().find((item) => /REPORT TOTAL/i.test(item.text));
    const nums = numbersFrom(line?.text);
    if (nums.length >= 2) {
      reconcileRows(rows, 'salvalue', nums.at(nums.length >= 8 ? -3 : -2));
      reconcileRows(rows, 'clvalue', nums.at(-1));
    }
  } else if (family === 'quirky-today') {
    const line = [...lines].reverse().find((item) => /REPORT TOTAL/i.test(item.text));
    const nums = numbersFrom(line?.text);
    if (nums.length >= 2) {
      reconcileRows(rows, 'salvalue', nums.at(-2));
      reconcileRows(rows, 'clvalue', nums.at(-1));
    }
  } else if (family === '4m') {
    const index = lines.findIndex((item) => /REPORT TOTAL/i.test(item.text));
    const nums = numbersFrom(lines[index + 1]?.text || '');
    if (nums.length >= 5) {
      reconcileRows(rows, 'salvalue', nums.at(-5));
      reconcileRows(rows, 'clvalue', nums.at(-1));
    }
  } else if (family === 'classic') {
    const sale = lines.find((item) => /Sale Stock Value/i.test(item.text));
    const close = lines.find((item) => /Closing Stock Value/i.test(item.text));
    reconcileRows(rows, 'salvalue', numbersFrom(sale?.text).at(-1));
    reconcileRows(rows, 'clvalue', numbersFrom(close?.text).at(-1));
  } else if (family === 'softronix') {
    const line = [...lines].reverse().find((item) => /Net Sale Value/i.test(item.text) && /Closing Stock Value/i.test(item.text));
    const nums = numbersFrom(line?.text);
    if (nums.length >= 2) {
      reconcileRows(rows, 'salvalue', nums.at(-2));
      reconcileRows(rows, 'clvalue', nums.at(-1));
    }
  } else if (family === 'sale-stock-v15') {
    const index = lines.findLastIndex((item) => /Report Total|Total For Company/i.test(item.text));
    const totalNums = numbersFrom(lines[index]?.text);
    const valueNums = numbersFrom(lines[index + 1]?.text);
    if (valueNums.length >= 12) {
      reconcileRows(rows, 'salvalue', valueNums[6]);
      reconcileRows(rows, 'clvalue', valueNums[9]);
    } else if (valueNums.length >= 7) {
      reconcileRows(rows, 'salvalue', valueNums[4]);
      reconcileRows(rows, 'clvalue', valueNums[6]);
    } else if (totalNums.length >= 2) {
      reconcileRows(rows, 'salvalue', totalNums.at(-3));
      reconcileRows(rows, 'clvalue', totalNums.at(-1));
    }
  }
}

export async function parseGenericReport(buffer) {
  const lines = await extractPdfLines(buffer);
  const text = lines.map((line) => line.text).join('\n');
  let rows = [];
  let family = 'generic';
  if (isSoftTouchReport(lines)) return parseSoftTouchLines(lines);
  if (isSoftWaveReport(lines)) return parseSoftWaveLines(lines);
  if (isDevoTechReport(lines)) return parseDevoTechLines(lines);
  if (isSmartInfotechReport(lines)) return parseSmartInfotechLines(lines);
  if (isDistCodeReport(lines)) return parseDistCodeLines(lines);
  if (isStockStatementReport(lines)) return parseStockStatementLines(lines);
  if (isStockBalanceReport(lines)) return parseStockBalanceLines(lines);
  if (isSalesPictureReport(lines)) return parseSalesPictureLines(lines);
  if (isNetSaleTransferReport(lines)) return parseNetSaleTransferLines(lines);
  if (isValueAtTpReport(lines)) return parseValueAtTpLines(lines);
  if (isClicknetReport(lines)) {
    try {
      return parseClicknetLines(lines);
    } catch {
      // Other Clicknet templates are handled below.
    }
  }
  // Quirky Tech reports, recognised by their column headers.
  if (isQuirkyStockReport(lines)) return parseQuirkyStockLines(lines);
  if (quirkyLayout(lines)) {
    try {
      return parseQuirkyLines(lines);
    } catch (error) {
      if (isQuirkySaleStockReport(text)) throw error;
    }
  }
  if (/Sale Invoice/i.test(text) && /4M Technologies/i.test(text)) { family = '4m'; rows = parse4M(lines); }
  else if (isQuirkySaleStockReport(text)) {
    family = /Today\s+Today/i.test(text) ? 'quirky-today' : 'quirky';
    rows = parseQuirky(lines, family === 'quirky-today');
  }
  else if (/Sale And Stock Report/i.test(text) && /Version\s+1\.0\.0\.15/i.test(text)) { family = 'sale-stock-v15'; rows = parseSaleStockV15(lines); }
  else if (/Sale & Stock Report \(TP\)/i.test(text)) rows = parseClicknet(lines);
  else if (/Developed by:\s*Softronix/i.test(text)) { family = 'softronix'; rows = parseSoftronix(lines); }
  else if (/S\s*A\s*L\s*E\s*S\s*&\s*S\s*T\s*O\s*C\s*K\s*R\s*E\s*P\s*O\s*R\s*T/i.test(text)) { family = 'classic'; rows = parseClassicStock(lines); }
  if (!rows.length) rows = parseNumericTail(lines);
  rows = rows.filter((row) => row.pafk && !TOTAL_LINE.test(row.pafk));
  reconcilePrintedTotals(rows, lines, family);
  if (!rows.length) throw new Error('No product rows could be extracted from this PDF layout.');
  return rows;
}
