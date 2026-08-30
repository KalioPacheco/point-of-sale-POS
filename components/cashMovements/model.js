const mongoose = require('mongoose');
const {
  Counter,
  companyToken,
  counterKey,
  formatSequence
} = require('../operationalCounters/model');
const {
  CASH_MOVEMENT_TYPES,
  CASH_MOVEMENT_IN_TYPES,
  CASH_MOVEMENT_OUT_TYPES,
  CASH_MOVEMENT_TYPE_DESCRIPTIONS,
} = require('./types');

const { Schema } = mongoose;

const cashMovementSchema = new Schema({
  movementNumber: {
    type: String,
    unique: true,
    required: true,
  },
  type: {
    type: String,
    enum: CASH_MOVEMENT_TYPES,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  concept: {
    type: String,
    required: true,
  },
  description: String,
  

  paymentMethod: { 
    type: String, 
    enum: ['cash', 'card', 'transfer', 'mixed'],
    default: 'cash'
  },
  user: {
    type: Schema.ObjectId,
    ref: 'Users',
    required: true,
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
  },
  cashRegister: String,
  saleReference: {
    type: Schema.ObjectId,
    ref: 'Sales',
  },
  shift: { type: Schema.ObjectId, ref: 'CashRegisterShifts' },
  

  receiptNumber: String,
  authorized: {
    type: Boolean,
    default: true,
  },
  authorizedBy: {
    type: Schema.ObjectId,
    ref: 'Users',
  },
  notes: String,
  disable: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

cashMovementSchema.statics.generateMovementNumber = async function generateMovementNumber(
  company,
  cashRegister = 'GLOBAL',
  session = null
) {
  if (!company) throw new Error('Company is required to generate a movement number');
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `MOV-${companyToken(company)}-${cashRegister}-${dateStr}`;
  
  const lastMovement = await this.findOne({
    company,
    movementNumber: { $regex: `^${prefix}` }
  }).sort({ movementNumber: -1 }).session(session).lean();
  const baseline = Number(lastMovement?.movementNumber?.split('-').pop()) || 0;
  const sequence = await Counter.next(counterKey({
    kind: 'movement', company, cashRegister, date: dateStr
  }), baseline, session);
  return formatSequence(prefix, sequence, 4);
};

cashMovementSchema.methods.getMovementSign = function getMovementSign() {
  if (CASH_MOVEMENT_IN_TYPES.includes(this.type)) {
    return 1;
  }
  if (CASH_MOVEMENT_OUT_TYPES.includes(this.type)) {
    return -1;
  }
  return 0;
};

cashMovementSchema.methods.getTypeDescription = function getTypeDescription() {
  return CASH_MOVEMENT_TYPE_DESCRIPTIONS[this.type] || this.type;
};

cashMovementSchema.methods.getFormattedMovement = function getFormattedMovement() {
  const sign = this.getMovementSign();
  let signSymbol = '+/-';
  if (sign > 0) {
    signSymbol = '+';
  } else if (sign < 0) {
    signSymbol = '-';
  }

  return {
    number: this.movementNumber,
    type: this.getTypeDescription(),
    concept: this.concept,
    amount: this.amount,
    sign: signSymbol,
    date: this.createdAt,
    user: this.user,
    cashRegister: this.cashRegister || 'N/A',
  };
};

module.exports = mongoose.model('CashMovements', cashMovementSchema, 'cashMovements');
