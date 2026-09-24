import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTotals, expectTotal, totalsMismatches, totalsStatus, TotalsMismatchError } from '../src/parsers/totals.js';

const rows = () => [
  { pafk: 'A', salvalue: 100, clvalue: 1000 },
  { pafk: 'B', salvalue: 250, clvalue: 500 },
];

test('never modifies rows when the printed total differs', () => {
  const parsed = rows();
  expectTotal(parsed, 'salvalue', 900);
  assert.deepEqual(totalsMismatches(parsed), [{ field: 'salvalue', parsed: 350, printed: 900 }]);
  assert.deepEqual(parsed.map((row) => row.salvalue), [100, 250]);
  assert.throws(() => assertTotals(parsed), TotalsMismatchError);
});

test('accepts totals that match within whole-rupee rounding', () => {
  const parsed = rows();
  expectTotal(parsed, 'salvalue', 351);
  expectTotal(parsed, 'clvalue', 1500);
  assert.deepEqual(totalsMismatches(parsed), []);
});

test('allows the rounding drift of many rounded rows, but not a missing row', () => {
  const many = Array.from({ length: 100 }, (_, index) => ({ pafk: `P${index}`, salvalue: 10 }));
  expectTotal(many, 'salvalue', 1006); // 100 rounded rows: up to ~10 rupees drift
  assert.deepEqual(totalsMismatches(many), []);
  expectTotal(many, 'salvalue', 1050); // a missing row worth 50
  assert.equal(totalsMismatches(many).length, 1);
});

test('treats a total beyond a parser guard as a different figure, not a mismatch', () => {
  const parsed = rows();
  expectTotal(parsed, 'salvalue', 50000, 100);
  assert.deepEqual(totalsMismatches(parsed), []);
  expectTotal(parsed, 'salvalue', 400, 100);
  assert.equal(totalsMismatches(parsed).length, 1);
});

test('rows without printed totals are not rejected', () => {
  assert.deepEqual(totalsMismatches(rows()), []);
});

test('reports whether rows were verified against printed totals', () => {
  assert.equal(totalsStatus(rows()), 'unverified');
  const matched = expectTotal(rows(), 'salvalue', 350);
  assert.equal(totalsStatus(expectTotal(matched, 'clvalue', 1500)), 'verified');
  assert.equal(totalsStatus(expectTotal(rows(), 'salvalue', 50000, 100)), 'unverified');
  assert.equal(totalsStatus(expectTotal(rows(), 'salvalue', 400)), 'mismatch');
});

test('a zero printed total does not count as verification', () => {
  const empty = [{ pafk: 'A', salvalue: 0, clvalue: 1000 }];
  expectTotal(empty, 'salvalue', 0);
  expectTotal(empty, 'clvalue', 1000);
  assert.equal(totalsStatus(empty), 'unverified');
});
