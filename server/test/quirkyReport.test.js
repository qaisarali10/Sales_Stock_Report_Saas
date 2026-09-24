import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import test from 'node:test';
import { parseQuirkyLines, parseQuirkyReport, quirkyLayout, roundToPrintedTotal } from '../src/parsers/quirkyReport.js';
import { totalsMismatches } from '../src/parsers/totals.js';
import { getParser } from '../src/parsers/registry.js';

// Builds a pdfText-style line from "text@x" tokens.
function line(spec) {
  const words = spec.map(([text, x, width = 10]) => ({ text, x, width }));
  return { text: words.map((word) => word.text).join(' '), words };
}

const HEADER = line([
  ['Item Description', 69], ['Rate', 188], ['Pack', 223], ['Balance', 262], ['Purchase', 314], ['Return', 370],
  ['Total', 424], ['Net Sales', 471], ['Bonus', 529], ['Value', 585], ['Adjustment', 627], ['Balance', 676],
  ['Value', 729], ['Sale', 769], ['Return', 799],
]);

// 18 cells: open q/b, purchase q/b, return q/b, total q/b, net sales, bonus,
// value, adjustment q/b, closing q/b, closing value, today sale, today return.
const CELL_X = [270, 299, 325, 351, 378, 402, 428, 455, 505, 555, 610, 637, 654, 685, 712, 745, 784, 823];
function product(name, rate, pack, cells) {
  const packWords = pack ? [[pack, 217]] : [];
  return line([[name, 22], [rate, 180], ...packWords, ...cells.map((cell, index) => [String(cell), CELL_X[index]])]);
}

test('reads the column layout from the Quirky header', () => {
  assert.deepEqual(quirkyLayout([HEADER]), { cellCount: 18, sqty: 8, sbonus: 9, salvalue: 10, clqty: 13, clbonus: 14, clvalue: 15 });
});

test('reads sale and closing values regardless of pack shape, and keeps free-goods lines', () => {
  const rows = parseQuirkyLines([
    HEADER,
    product('023015 Catex Infusion', '206.55', '100 ml', [46, '-', '-', '-', '-', '-', 46, '-', 40, '-', 8262, '-', '-', 6, '-', 1239, '-', '-']),
    product('023092 Aminocid SYP', '134.00', null, [30, '-', '-', '-', '-', '-', 30, '-', '-', '-', '-', '-', '-', 30, '-', 4020, '-', '-']),
    product('023014 Catex 500mg Tab', '86.00', '10S', [37, '-', 10, '-', '-', '-', 47, '-', 47, '-', 4042, '-', '-', '-', '-', '-', 31, '-']),
    product('023021 Cestonil Plus Syp 120ML', '-', '120ML', ['-', 5, '-', 650, '-', '-', '-', 655, '-', 263, '-', '-', 2, '-', 394, '-', '-', '-']),
  ]);
  assert.deepEqual(rows.map((row) => [row.pafk, row.sprice, row.sqty, row.sbonus, row.salvalue, row.clqty, row.clbonus, row.clvalue]), [
    ['Catex Infusion', 206.55, 40, 0, 8262, 6, 0, 1239],
    ['Aminocid SYP', 134, 0, 0, 0, 30, 0, 4020],
    ['Catex 500mg Tab', 86, 47, 0, 4042, 0, 0, 0],
    ['Cestonil Plus Syp 120ML', 0, 0, 263, 0, 0, 394, 0],
  ]);
});

test('fails loudly on a product line that does not fit the layout', () => {
  assert.throws(() => parseQuirkyLines([HEADER, line([['023015 Broken Row', 22], ['206.55', 180], ['46', 270]])]), /do not match the column layout/);
});

test('re-rounds rows so they sum exactly to the printed total', () => {
  // Exact values 31.50 + 20.25 + 7.50 = 59.25 print as 32 + 20 + 8 = 60, but
  // the report total prints 59. Floors give 58, so one row is rounded up: the
  // largest fraction (.50, first on a tie).
  const rows = [{ sprice: 10.5, sqty: 3, salvalue: 32 }, { sprice: 20.25, sqty: 1, salvalue: 20 }, { sprice: 7.5, sqty: 1, salvalue: 8 }];
  roundToPrintedTotal(rows, 'salvalue', 'sqty', 59);
  assert.deepEqual(rows.map((row) => row.salvalue), [32, 20, 7]);
  assert.equal(rows.reduce((total, row) => total + row.salvalue, 0), 59);
});

test('leaves printed values alone when a row is not quantity x rate', () => {
  const rows = [{ sprice: 10, sqty: 3, salvalue: 25 }, { sprice: 20.25, sqty: 1, salvalue: 20 }];
  roundToPrintedTotal(rows, 'salvalue', 'sqty', 50);
  assert.deepEqual(rows.map((row) => row.salvalue), [25, 20]);
});

test('leaves printed values alone when the total cannot be reached by rounding', () => {
  const rows = [{ sprice: 10.5, sqty: 1, salvalue: 11 }, { sprice: 20, sqty: 1, salvalue: 20 }];
  roundToPrintedTotal(rows, 'salvalue', 'sqty', 40);
  assert.deepEqual(rows.map((row) => row.salvalue), [11, 20]);
});

const SAMPLE_NAME = 'AL-AZIZ DISTRIBUTOR  ABBOTABAD.pdf';
const SAMPLE = [new URL(`../../${SAMPLE_NAME}`, import.meta.url), new URL(`../../New folder/${SAMPLE_NAME}`, import.meta.url)].find(existsSync) || new URL(`../../${SAMPLE_NAME}`, import.meta.url);

test('AL AZIZ DISTRIBUTOR ABBOTTABAD matches the printed report totals', { skip: !existsSync(SAMPLE) && 'sample PDF not present' }, async () => {
  const rows = await parseQuirkyReport(await fs.readFile(SAMPLE));
  const sum = (field) => rows.reduce((total, row) => total + row[field], 0);
  const exact = (qty) => rows.reduce((total, row) => total + row[qty] * row.sprice, 0);

  assert.equal(rows.length, 136);
  assert.equal(sum('sqty'), 2705); // printed Net Sales total
  // Totals equal the printed Report Total exactly ...
  assert.equal(sum('salvalue'), 494968);
  assert.equal(sum('clvalue'), 1071340);
  assert.equal(Math.round(exact('sqty')), 494968);
  assert.equal(Math.round(exact('clqty')), 1071340);
  // ... while every row stays a whole-rupee rounding of quantity x rate.
  for (const row of rows) {
    assert.ok(Number.isInteger(row.salvalue) && Math.abs(row.sqty * row.sprice - row.salvalue) < 1, `${row.pafk} sale value`);
    assert.ok(Number.isInteger(row.clvalue) && Math.abs(row.clqty * row.sprice - row.clvalue) < 1, `${row.pafk} closing value`);
  }
  assert.deepEqual(rows.printedTotals, { salvalue: { value: 494968, maxDelta: Infinity }, clvalue: { value: 1071340, maxDelta: Infinity } });
  assert.deepEqual(totalsMismatches(rows), []);

  const routed = await getParser({ distributorId: 194 })(await fs.readFile(SAMPLE), {});
  assert.equal(routed.length, 136, 'a wrong distributor-specific parser must lose to a result verified against the printed totals');
  assert.equal(routed.reduce((total, row) => total + row.salvalue, 0), 494968);

  const cestonil = rows.find((row) => row.pafk === 'Cestonil Plus Syp 120ML' && row.sprice === 233.75);
  assert.deepEqual([cestonil.sqty, cestonil.salvalue, cestonil.clqty, cestonil.clvalue], [526, 122953, 785, 183494]);
  const nysol = rows.find((row) => row.pafk === 'Nysol Solution (HDP)' && row.sprice === 106);
  assert.deepEqual([nysol.sqty, nysol.salvalue, nysol.clqty, nysol.clvalue], [184, 19504, 1204, 127624]);
});
