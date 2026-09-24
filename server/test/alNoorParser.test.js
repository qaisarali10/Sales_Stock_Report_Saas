import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import test from 'node:test';
import { parseGenericReport } from '../src/parsers/genericReport.js';

const NAME = 'Al Noor Medicine Company (Sadiq Abad).pdf';
const SAMPLE = [new URL(`../../${NAME}`, import.meta.url), new URL(`../../New folder/${NAME}`, import.meta.url)].find(existsSync);

test('preserves Al Noor Softronix row sale and closing values from the PDF', { skip: !SAMPLE && 'sample PDF not present' }, async () => {
  const pdf = await fs.readFile(SAMPLE);
  const rows = await parseGenericReport(pdf);
  const zerax = rows.find((row) => row.pafk === 'ZERAX 20MG TAB 1*10(1)');

  assert.equal(rows.length, 39);
  assert.equal(zerax?.salvalue, 1440);
  assert.equal(zerax?.clvalue, 2928);
  assert.equal(rows.reduce((sum, row) => sum + row.salvalue, 0), 207376);
  assert.equal(rows.reduce((sum, row) => sum + row.clvalue, 0), 784684);
});
