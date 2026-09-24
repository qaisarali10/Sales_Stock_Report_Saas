const NUMERIC_FIELDS = ['sprice', 'sqty', 'sbonus', 'salvalue', 'clqty', 'clbonus', 'clvalue'];
const MAX_ABSOLUTE_VALUE = 1_000_000_000_000;
const MAX_ROWS = 50000;

export function validateParsedRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('The parser returned no product rows.');
  if (rows.length > MAX_ROWS) throw new Error(`The parser returned more than ${MAX_ROWS} rows and was rejected.`);

  for (const [index, row] of rows.entries()) {
    if (!String(row?.pafk || '').trim()) throw new Error(`Parsed row ${index + 1} has no product name.`);
    if (String(row.pafk).length > 300) throw new Error(`Parsed row ${index + 1} has an invalid product name.`);
    for (const field of NUMERIC_FIELDS) {
      const value = Number(row[field] ?? 0);
      if (!Number.isFinite(value) || Math.abs(value) > MAX_ABSOLUTE_VALUE) {
        throw new Error(`Parsed row ${index + 1} contains an invalid ${field} value.`);
      }
    }
  }
  return rows;
}
