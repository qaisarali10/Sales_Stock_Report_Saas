import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  legacyId: { type: Number, unique: true, sparse: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 }
}, { timestamps: true });

export const Company = mongoose.model('Company', schema);
