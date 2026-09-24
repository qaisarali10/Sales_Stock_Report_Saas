import path from 'node:path';

export function extractIds(filename) {
  const base = path.basename(filename);
  const match = base.match(/^(\d+)\s*[-_]\s*(\d+)(?:\s*[-_]|\b)/);
  if (!match) return { companyId: null, distributorId: null };
  return { companyId: Number(match[1]), distributorId: Number(match[2]) };
}

export function safeBaseName(filename) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._ -]/g, '_');
}

export function excelName(filename) {
  return `${path.parse(safeBaseName(filename)).name || 'parsed'}.xlsx`;
}
