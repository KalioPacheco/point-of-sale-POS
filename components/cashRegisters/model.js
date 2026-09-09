const mongoose = require('mongoose');

const { Schema } = mongoose;

const cashRegisterSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  branch: { type: Schema.ObjectId, ref: 'Branches', required: true, index: true },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.ObjectId, ref: 'Users' },
  updatedBy: { type: Schema.ObjectId, ref: 'Users' },
}, { timestamps: true });

cashRegisterSchema.index({ company: 1, code: 1 }, { unique: true });
cashRegisterSchema.index({ company: 1, branch: 1, active: 1, name: 1, _id: 1 });

module.exports = mongoose.model('CashRegisters', cashRegisterSchema, 'cashRegisters');
