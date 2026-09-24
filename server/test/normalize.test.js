import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow, numberValue, OUTPUT_COLUMNS } from '../src/parsers/normalize.js';

test('normalizes aliases into the required Excel contract', () => {
  const row = normalizeRow({ 'Product Name': 'Tablet 500MG', 'Sale Value': '1,250.50', 'Closing Value': '(50)' });
  assert.deepEqual(Object.keys(row), OUTPUT_COLUMNS);
  assert.equal(row.pafk, 'Tablet 500MG');
  assert.equal(row.salvalue, 1250.5);
  assert.equal(row.clvalue, -50);
});

test('invalid numeric data becomes zero', () => assert.equal(numberValue('not-a-number'), 0));
