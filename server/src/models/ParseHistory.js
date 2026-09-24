import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  legacyId: { type: Number, unique: true, sparse: true, index: true },
  distributor: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  filename: { type: String, required: true },
  rowCount: { type: Number, default: 0 },
  status: { type: String, enum: ['success', 'failed'], default: 'success' },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

export const ParseHistory = mongoose.model('ParseHistory', schema);
