import test from 'node:test';
import assert from 'node:assert/strict';
import { excelName, extractIds, safeBaseName } from '../src/utils/filename.js';

test('extracts company and distributor IDs from legacy filenames', () => {
  assert.deepEqual(extractIds('1-295-Dist.pdf'), { companyId: 1, distributorId: 295 });
  assert.deepEqual(extractIds('2_547_AL SYED.pdf'), { companyId: 2, distributorId: 547 });
  assert.deepEqual(extractIds('unknown.pdf'), { companyId: null, distributorId: null });
});

test('sanitizes upload and output names', () => {
  assert.equal(safeBaseName('../1-295 bad?.pdf'), '1-295 bad_.pdf');
  assert.equal(excelName('1-295-Dist.pdf'), '1-295-Dist.xlsx');
});
