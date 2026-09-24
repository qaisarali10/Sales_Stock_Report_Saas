import ExcelJS from 'exceljs';
import XLSX from '@lokalise/xlsx';
import { normalizeRow, numberValue } from './normalize.js';
import { assertTotals, expectTotal } from './totals.js';

function cellValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || value instanceof Date) return value;
  if ('result' in value) return value.result;
  if ('text' in value) return value.text;
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  return cell.text || null;
}

async function rowsFromWorkbook(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) : [];
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const source = sheet.getRow(rowNumber);
    const row = [];
    for (let column = 1; column <= sheet.columnCount; column += 1) row.push(cellValue(source.getCell(column)));
    rows.push(row);
  }
  return rows;
}

function parseStockSaleLayout(rows) {
  const header = rows.findIndex((row) => text(row[0]).toUpperCase() === 'DESCRIPTION'
    && text(row[9]).toUpperCase().includes('SALE'));
  if (header < 0) return [];
  return rows.slice(header + 2).map((row) => normalizeRow({
    pafk: text(row[0]), sprice: row[2], sqty: row[8], sbonus: row[7], salvalue: row[9],
    clqty: row[13], clbonus: 0, clvalue: row[14]
  })).filter((row) => row.pafk && row.sprice > 0 && !/total/i.test(row.pafk));
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseItemLayout(rows) {
  const start = rows.findIndex((row) => text(row[0]).toUpperCase() === 'ITEM');
  if (start < 0) return [];
  return rows.slice(start + 2).map((row) => normalizeRow({
    pafk: text(row[0]), sprice: row[1], sqty: row[11], sbonus: row[12], salvalue: row[13],
    clqty: row[14], clbonus: 0, clvalue: row[15]
  })).filter((row) => row.pafk && row.sprice > 0 && !/total/i.test(row.pafk));
}

function parseProductsLayout(rows) {
  const start = rows.findIndex((row) => /PRODUCTS NAMES/i.test(text(row[0])));
  if (start < 0) return [];
  let reportSale = null;
  let reportClose = null;
  const parsed = rows.slice(start + 2).map((source) => {
    const sprice = numberValue(source[11]);
    if (sprice <= 0) {
      if (numberValue(source[8]) > 0) reportSale ??= numberValue(source[8]);
      if (numberValue(source[7]) > 0) reportClose ??= numberValue(source[7]);
      return null;
    }
    const sqty = numberValue(source[5]);
    const clqty = numberValue(source[7]);
    return normalizeRow({
      pafk: text(source[0]), sprice, sqty, sbonus: source[6], salvalue: sqty * sprice,
      clqty, clbonus: 0, clvalue: clqty * sprice
    });
  }).filter((row) => row?.pafk && !/total/i.test(row.pafk));
  if (reportSale) expectTotal(parsed, 'salvalue', reportSale);
  if (reportClose) expectTotal(parsed, 'clvalue', reportClose);
  return parsed;
}

export async function parseTabularReport(buffer) {
  const rows = await rowsFromWorkbook(buffer);
  const head = rows.slice(0, 20);
  let parsed = [];
  if (head.some((row) => text(row[0]).toUpperCase() === 'DESCRIPTION')) parsed = parseStockSaleLayout(rows);
  else if (head.some((row) => text(row[0]).toUpperCase() === 'ITEM')) parsed = parseItemLayout(rows);
  else if (head.some((row) => /PRODUCTS NAMES/i.test(text(row[0])))) parsed = parseProductsLayout(rows);
  if (!parsed.length) throw new Error('Unsupported Excel report layout.');
  return assertTotals(parsed);
}
