import { Router } from 'express';
import mongoose from 'mongoose';
import { Company } from '../models/Company.js';
import { Distributor } from '../models/Distributor.js';
import { asyncRoute } from '../utils/errors.js';
import { AppError } from '../utils/errors.js';
import { matchDistributor } from '../services/distributorResolver.js';

export const catalogRouter = Router();

catalogRouter.get('/companies', asyncRoute(async (_req, res) => {
  const companies = await Company.find().sort({ name: 1 }).lean();
  res.json({ status: 'success', companies });
}));

catalogRouter.get('/distributors', asyncRoute(async (req, res) => {
  const query = { active: req.query.active === 'false' ? false : true };
  if (req.query.company) {
    if (!mongoose.isValidObjectId(req.query.company)) throw new AppError(400, 'Invalid company identifier.');
    query.company = req.query.company;
  }
  const distributors = await Distributor.find(query).populate('company').sort({ name: 1 }).lean();
  res.json({ status: 'success', distributors });
}));

catalogRouter.get('/distributors/match', asyncRoute(async (req, res) => {
  const filename = String(req.query.filename || '').trim();
  if (!filename || filename.length > 255) throw new AppError(400, 'A filename of up to 255 characters is required.');
  res.json({ status: 'success', ...(await matchDistributor(filename)) });
}));
