import ExcelJS from 'exceljs';
import { OUTPUT_COLUMNS } from '../parsers/normalize.js';

export async function createWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Parsed Data');
  sheet.columns = OUTPUT_COLUMNS.map((column) => ({
    header: column,
    key: column,
    width: column === 'pafk' ? 42 : 14,
  }));
  for (const row of rows) {
    sheet.addRow(Object.fromEntries(OUTPUT_COLUMNS.map((column) => [column, row[column] ?? ''])));
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
