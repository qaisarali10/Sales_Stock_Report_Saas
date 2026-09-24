import assert from 'node:assert/strict';
import test from 'node:test';
import { validateParsedRows } from '../src/parsers/validateRows.js';

const validRow = { pafk: 'PRODUCT', sprice: 10, sqty: 2, sbonus: 0, salvalue: 20, clqty: 3, clbonus: 0, clvalue: 30 };

test('accepts finite normalized parser rows', () => {
  assert.equal(validateParsedRows([validRow]).length, 1);
});

test('rejects empty or corrupt parser output', () => {
  assert.throws(() => validateParsedRows([]), /no product rows/);
  assert.throws(() => validateParsedRows([{ ...validRow, salvalue: Number.NaN }]), /invalid salvalue/);
  assert.throws(() => validateParsedRows([{ ...validRow, pafk: '' }]), /no product name/);
});
