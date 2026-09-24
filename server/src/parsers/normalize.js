export const OUTPUT_COLUMNS = ['pafk', 'sprice', 'sqty', 'sbonus', 'salvalue', 'clqty', 'clbonus', 'clvalue'];

export function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value).replace(/,/g, '').replace(/^\((.*)\)$/, '-$1').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeRow(row) {
  const result = {};
  for (const column of OUTPUT_COLUMNS) result[column] = column === 'pafk' ? '' : 0;
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases = {
      pname: 'pafk', productname: 'pafk', itemdescription: 'pafk', description: 'pafk', itemname: 'pafk',
      pack: 'pafk', packing: 'pafk', pakf: 'pafk', tp: 'sprice', tradeprice: 'sprice',
      saleqty: 'sqty', salesqty: 'sqty', bonus: 'sbonus', salebonus: 'sbonus',
      salevalue: 'salvalue', salesvalue: 'salvalue', closingqty: 'clqty', closingbonus: 'clbonus', closingvalue: 'clvalue',
      sbounus: 'sbonus', bouns: 'sbonus', clbounus: 'clbonus'
    };
    const target = OUTPUT_COLUMNS.includes(normalizedKey) ? normalizedKey : aliases[normalizedKey];
    if (!target) continue;
    result[target] = target === 'pafk' ? String(value || '').trim() : numberValue(value);
  }
  return result;
}
