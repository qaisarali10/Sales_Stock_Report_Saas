import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  legacyId: { type: Number, unique: true, sparse: true, index: true },
  parseHistory: { type: mongoose.Schema.Types.ObjectId, ref: 'ParseHistory', unique: true, sparse: true },
  distributor: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  originalFilename: { type: String, required: true },
  excelFilename: { type: String, required: true },
  storagePath: { type: String, required: true },
  fileSize: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

export const SavedFile = mongoose.model('SavedFile', schema);
