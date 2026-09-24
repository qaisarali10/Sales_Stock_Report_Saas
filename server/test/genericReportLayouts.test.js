import assert from 'node:assert/strict';
import test from 'node:test';
import { parse4M, parseNumericTail, parseQuirky } from '../src/parsers/genericReport.js';

test('Quirky reports require the closing value column they read', () => {
  const short = [{ text: '12345 Product A 10.00 PACK 1 2 3 4 5 6 7 8 9 10 11 12 13 14' }];
  const complete = [{ text: '12345 Product A 10.00 PACK 1 2 3 4 5 6 7 8 9 10 110 12 13 140 15 1600' }];

  assert.deepEqual(parseQuirky(short, false), []);
  assert.deepEqual(parseQuirky(complete, false), [{
    pafk: 'Product A',
    sprice: 10,
    sqty: 9,
    sbonus: 10,
    salvalue: 110,
    clqty: 140,
    clbonus: 0,
    clvalue: 1600,
  }]);
});

test('4M reports require all numeric columns through closing value', () => {
  const short = [{ text: '12345 Product B 20.00 1 2 3 4 5 6 7 8 9 10 11 12 13 14 150 16 17 180' }];
  const complete = [{ text: '12345 Product B 20.00 1 2 3 4 5 6 7 8 9 10 11 12 13 14 150 16 17 180 19 2000' }];

  assert.deepEqual(parse4M(short), []);
  assert.deepEqual(parse4M(complete), [{
    pafk: 'Product B',
    sprice: 20,
    sqty: 13,
    sbonus: 14,
    salvalue: 150,
    clqty: 180,
    clbonus: 0,
    clvalue: 2000,
  }]);
});

test('numeric-tail fallback treats dash placeholders as zero-value columns', () => {
  const rows = parseNumericTail([{
    text: 'Sample Product 10.00 2 - 20 3 -',
    words: ['Sample', 'Product', '10.00', '2', '-', '20', '3', '-'].map((text) => ({ text })),
  }]);

  assert.deepEqual(rows, [{
    pafk: 'Sample Product',
    sprice: 10,
    sqty: 2,
    sbonus: 0,
    salvalue: 20,
    clqty: 3,
    clbonus: 0,
    clvalue: 0,
  }]);
});
