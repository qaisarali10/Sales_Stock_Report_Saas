import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSoftWaveStock } from '../src/parsers/genericReport.js';

test('maps Bilal SoftWave sale and closing columns without shifting them', () => {
  const rows = parseSoftWaveStock([{ text: '448 Aerocef 100mg Sus 30ML 266.90 143 38166 330 58718 256 68326 123 32828 0 0 94 25088' }]);
  assert.deepEqual(rows, [{
    pafk: 'Aerocef 100mg Sus 30ML', sprice: 266.9,
    sqty: 256, sbonus: 123, salvalue: 68326,
    clqty: 94, clbonus: 0, clvalue: 25088,
  }]);
});

test('does not treat Bilal group totals as product rows', () => {
  assert.deepEqual(parseSoftWaveStock([{ text: 'Total of GERNAL 1800 1220306 756858 1143393 555410 0 688261' }]), []);
});
