import assert from 'node:assert/strict';
import test from 'node:test';
import { inferPrintedTotals } from '../src/parsers/printedTotals.js';

const lines = (...text) => text.map((value) => ({ text: value }));

test('reads explicit net-sale and closing-stock footer values', () => {
  assert.deepEqual(inferPrintedTotals(lines(
    'Net Sale Value : 684,403',
    'Closing Stock Value: 656,959',
  )), { sale: 684403, close: 656959 });
});

test('reads explicit net-sale and closing-stock values from the same footer line', () => {
  assert.deepEqual(inferPrintedTotals(lines(
    'Net Sale Value: 207,375 Closing Stock Value: 784,684',
  )), { sale: 207375, close: 784684 });
});

test('reads classic total rows with sale and closing as final values', () => {
  assert.deepEqual(inferPrintedTotals(lines(
    'Item Description Opening Purchase Total Sale Return Closing',
    'Grand Total: 2,098,728.10 2,097,600.69 737,220.47 2,767,324.20',
  )), { sale: 737220.47, close: 2767324.2 });
});

test('reads company grand totals with return columns after sale value', () => {
  assert.deepEqual(inferPrintedTotals(lines(
    'Grand Totals Of Companies: 2481669 2878407 3120880 1187703 0 2360630',
  )), { sale: 3120880, close: 2360630 });
});
