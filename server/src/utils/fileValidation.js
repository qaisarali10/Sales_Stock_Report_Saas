import path from 'node:path';
import { AppError } from './errors.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const XLS_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function startsWith(buffer, signature) {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

export function extensionKind(filename) {
  const extension = path.extname(String(filename || '')).toLowerCase();
  if (extension === '.pdf') return 'pdf';
  if (extension === '.xlsx') return 'xlsx';
  if (extension === '.xls') return 'xls';
  if (extension === '.jpg' || extension === '.jpeg') return 'jpeg';
  if (extension === '.png') return 'png';
  return null;
}

export function validateUploadFile(file) {
  const kind = extensionKind(file?.originalname);
  const buffer = file?.buffer;
  if (!kind || !Buffer.isBuffer(buffer)) throw new AppError(400, 'Only PDF, XLS, XLSX, JPG, and PNG files are accepted.');

  const valid = kind === 'pdf' ? buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))
    : kind === 'png' ? startsWith(buffer, PNG_SIGNATURE)
      : kind === 'jpeg' ? startsWith(buffer, Buffer.from([0xff, 0xd8, 0xff]))
        : kind === 'xls' ? startsWith(buffer, XLS_SIGNATURE)
        : startsWith(buffer, Buffer.from('PK'))
          && buffer.includes(Buffer.from('[Content_Types].xml'))
          && buffer.includes(Buffer.from('xl/workbook.xml'));

  if (!valid) throw new AppError(400, `The uploaded content is not a valid ${kind.toUpperCase()} file.`);
  return kind;
}

export function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
