import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { config } from '../config.js';
import { Distributor } from '../models/Distributor.js';
import { ParseHistory } from '../models/ParseHistory.js';
import { SavedFile } from '../models/SavedFile.js';
import { resolveDistributor, suggestDistributors } from '../services/distributorResolver.js';
import { createWorkbook } from '../services/excel.js';
import { getParser } from '../parsers/registry.js';
import { parseTabularReport } from '../parsers/tabularReport.js';
import { validateParsedRows } from '../parsers/validateRows.js';
import { limitConcurrentParses, parseRateLimit } from '../middleware/parseProtection.js';
import { AppError, asyncRoute } from '../utils/errors.js';
import { excelName, safeBaseName } from '../utils/filename.js';
import { validateUploadFile } from '../utils/fileValidation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    const supported = /\.(?:pdf|xlsx?|jpe?g|png)$/i.test(file.originalname);
    callback(supported ? null : new AppError(400, 'Only PDF, XLS, XLSX, JPG, and PNG files are accepted.'), supported);
  }
});

export const parseRouter = Router();

parseRouter.post('/parse', parseRateLimit, limitConcurrentParses, upload.single('pdf_file'), asyncRoute(async (req, res) => {
  if (!req.file) throw new AppError(400, 'PDF file is required.');
  const filename = safeBaseName(req.file.originalname);
  const fileKind = validateUploadFile(req.file);
  if (fileKind === 'jpeg' || fileKind === 'png') {
    throw new AppError(400, 'Image parsing is not supported on this server. Upload a text PDF or XLSX file.');
  }
  const selectedDistributorId = String(req.body.distributor_id || '').trim();
  let distributor;
  if (selectedDistributorId) {
    if (!mongoose.isValidObjectId(selectedDistributorId)) throw new AppError(400, 'Invalid distributor selection.');
    distributor = await Distributor.findOne({ _id: selectedDistributorId, active: true }).populate('company').lean();
    if (!distributor) throw new AppError(422, 'The selected distributor is no longer available.');
  } else {
    distributor = await resolveDistributor(filename);
  }
  if (!distributor) {
    const error = new AppError(422, 'Distributor could not be resolved from the filename.');
    error.code = 'DISTRIBUTOR_UNRESOLVED';
    error.suggestions = await suggestDistributors(filename);
    throw error;
  }

  const parser = fileKind === 'xlsx' || fileKind === 'xls'
    ? parseTabularReport
    : getParser(distributor);
  let rows;
  try {
    rows = validateParsedRows(await parser(req.file.buffer, { distributor, filename }));
  } catch (error) {
    await ParseHistory.create({
      distributor: distributor._id,
      company: distributor.company?._id || distributor.company || null,
      filename,
      status: 'failed',
      error: error.message
    }).catch((historyError) => console.error('Could not record failed parse history:', historyError));
    throw new AppError(422, `PDF parsing failed: ${error.message}`);
  }

  let history;
  let workbook;
  const outputName = excelName(filename);
  let storagePath;
  try {
    workbook = await createWorkbook(rows);
    history = await ParseHistory.create({
      distributor: distributor._id,
      company: distributor.company?._id || distributor.company || null,
      filename,
      rowCount: rows.length,
      status: 'success'
    });

    if (String(req.body.save_file || '').toLowerCase() === 'true' || req.body.save_file === 'on') {
      const storedName = `${Date.now()}-${crypto.randomUUID()}-${outputName}`;
      storagePath = path.join(config.savedFilesDir, storedName);
      await fs.mkdir(config.savedFilesDir, { recursive: true });
      await fs.writeFile(storagePath, workbook);
      await SavedFile.create({
        parseHistory: history._id,
        distributor: distributor._id,
        company: distributor.company?._id || distributor.company || null,
        originalFilename: filename,
        excelFilename: outputName,
        storagePath,
        fileSize: workbook.length
      });
    }
  } catch (error) {
    if (storagePath) await fs.rm(storagePath, { force: true }).catch(() => undefined);
    if (history?._id) await ParseHistory.deleteOne({ _id: history._id }).catch(() => undefined);
    throw new AppError(500, `Excel output failed: ${error.message}`);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
  res.setHeader('X-Parsed-Rows', String(rows.length));
  res.send(workbook);
}));
