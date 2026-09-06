const mongoose = require('mongoose');

const { Schema } = mongoose;

const supplierSchema = new Schema({
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  taxId: {
    type: String,
    trim: true,
    uppercase: true,
  },
  contactName: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000,
  },
  disable: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: Schema.ObjectId,
    ref: 'Users',
    required: true,
  },
}, { timestamps: true });

supplierSchema.index({ company: 1, name: 1 }, { unique: true });
supplierSchema.index({ company: 1, disable: 1, name: 1 });

module.exports = mongoose.model('Suppliers', supplierSchema, 'suppliers');
