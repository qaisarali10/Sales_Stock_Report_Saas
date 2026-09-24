import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  legacyId: { type: Number, unique: true, sparse: true, index: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  distributorId: { type: Number, required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  area: { type: String, default: null },
  subarea: { type: String, default: null },
  cell: { type: String, default: null },
  active: { type: Boolean, default: true, index: true }
}, { timestamps: true });

schema.index({ distributorId: 1, company: 1 });
schema.index({ name: 'text', area: 'text' });

export const Distributor = mongoose.model('Distributor', schema);
