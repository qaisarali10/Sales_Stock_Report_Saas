import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { extensionKind, isPathInside, validateUploadFile } from '../src/utils/fileValidation.js';

test('recognizes supported upload extensions', () => {
  assert.equal(extensionKind('report.PDF'), 'pdf');
  assert.equal(extensionKind('report.xlsx'), 'xlsx');
  assert.equal(extensionKind('report.xls'), 'xls');
  assert.equal(extensionKind('scan.jpeg'), 'jpeg');
  assert.equal(extensionKind('scan.png'), 'png');
  assert.equal(extensionKind('archive.zip'), null);
});

test('accepts a genuine legacy XLS compound-file signature', () => {
  const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  assert.equal(validateUploadFile({ originalname: 'report.xls', buffer: xls }), 'xls');
});

test('validates uploaded file signatures', () => {
  assert.equal(validateUploadFile({ originalname: 'report.pdf', buffer: Buffer.from('%PDF-1.7 data') }), 'pdf');
  assert.equal(validateUploadFile({ originalname: 'scan.jpg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) }), 'jpeg');
  const xlsx = Buffer.from('PK data [Content_Types].xml data xl/workbook.xml');
  assert.equal(validateUploadFile({ originalname: 'report.xlsx', buffer: xlsx }), 'xlsx');
  assert.throws(() => validateUploadFile({ originalname: 'report.pdf', buffer: Buffer.from('not a pdf') }), /not a valid PDF/);
});

test('keeps saved file paths inside their configured directory', () => {
  const root = path.resolve('saved-files');
  assert.equal(isPathInside(root, path.join(root, 'report.xlsx')), true);
  assert.equal(isPathInside(root, path.resolve(root, '..', 'secret.txt')), false);
});
