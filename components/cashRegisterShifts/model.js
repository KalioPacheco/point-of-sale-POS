const mongoose = require('mongoose');

const { Schema } = mongoose;

const cashRegisterShiftSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  cashRegister: { type: String, required: true, trim: true },
  cashier: { type: Schema.ObjectId, ref: 'Users', required: true },
  openingCash: { type: Number, required: true, min: 0 },
  closingCash: { type: Number, min: 0 },
  status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  cutStatus: {
    type: String,
    enum: ['not_required', 'pending', 'completed'],
    default: 'not_required',
    index: true
  },
  cut: { type: Schema.ObjectId, ref: 'CashRegisterCuts' },
  closeRequestedBy: { type: Schema.ObjectId, ref: 'Users' },
  closeRequestedAt: Date,
  openedAt: { type: Date, default: Date.now },
  closedAt: Date,
  notes: String
}, { timestamps: true });

cashRegisterShiftSchema.index(
  { company: 1, cashRegister: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

module.exports = mongoose.model(
  'CashRegisterShifts',
  cashRegisterShiftSchema,
  'cashRegisterShifts'
);
