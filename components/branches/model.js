const mongoose = require('mongoose');

const { Schema } = mongoose;

const addressSchema = new Schema({
  street: { type: String, trim: true, maxlength: 240 },
  city: { type: String, trim: true, maxlength: 120 },
  state: { type: String, trim: true, maxlength: 120 },
  country: { type: String, trim: true, maxlength: 120 },
  postalCode: { type: String, trim: true, maxlength: 24 },
}, { _id: false });

const branchSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  address: { type: addressSchema, default: () => ({}) },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.ObjectId, ref: 'Users' },
  updatedBy: { type: Schema.ObjectId, ref: 'Users' },
}, { timestamps: true });

branchSchema.index({ company: 1, code: 1 }, { unique: true });
branchSchema.index({ company: 1, active: 1, name: 1, _id: 1 });

module.exports = mongoose.model('Branches', branchSchema, 'branches');
