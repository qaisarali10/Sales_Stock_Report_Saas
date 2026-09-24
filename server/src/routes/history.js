import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { ParseHistory } from '../models/ParseHistory.js';
import { SavedFile } from '../models/SavedFile.js';
import { asyncRoute, AppError } from '../utils/errors.js';
import { isPathInside } from '../utils/fileValidation.js';

export const historyRouter = Router();

historyRouter.get('/history', asyncRoute(async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 5);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new AppError(400, 'History limit must be a positive integer.');
  const limit = Math.min(requestedLimit, 100);
  const history = await ParseHistory.find().populate('distributor company').sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ status: 'success', history: history.map((item) => ({
    id: item._id,
    distributor: item.distributor?.name || 'Unknown',
    company: item.company?.name || 'Unknown',
    filename: item.filename,
    rowCount: item.rowCount,
    status: item.status,
    error: item.error,
    createdAt: item.createdAt
  })) });
}));

historyRouter.get('/files/:id/download', asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid saved file identifier.');
  const file = await SavedFile.findById(req.params.id).lean();
  const storagePath = path.resolve(file?.storagePath || '');
  if (!file || !isPathInside(config.savedFilesDir, storagePath) || !fs.existsSync(storagePath)) throw new AppError(404, 'Saved file not found.');
  res.download(storagePath, file.excelFilename);
}));
