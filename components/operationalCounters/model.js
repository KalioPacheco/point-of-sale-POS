const mongoose = require('mongoose');

const { Schema } = mongoose;

const counterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  sequence: { type: Number, required: true, min: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

counterSchema.statics.next = async function next(key, baseline = 0, session = null) {
  if (!key) throw new Error('Counter key is required');
  const initial = Number.isInteger(baseline) && baseline >= 0 ? baseline : 0;
  const increment = [{
    $set: {
      sequence: { $add: [{ $ifNull: ['$sequence', initial] }, 1] },
      updatedAt: '$$NOW'
    }
  }];
  let counter;
  try {
    counter = await this.findOneAndUpdate(
      { key },
      increment,
      { upsert: true, new: true, session }
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    counter = await this.findOneAndUpdate(
      { key },
      increment,
      { new: true, session }
    ).lean();
  }
  return counter.sequence;
};

function companyToken(company) {
  const value = String(company || 'global');
  return value.toUpperCase();
}

function counterKey({ kind, company, cashRegister = 'GLOBAL', date, subtype = 'default' }) {
  return [kind, company, cashRegister, date, subtype].map(String).join(':');
}

function formatSequence(prefix, sequence, padding = 4) {
  return `${prefix}-${String(sequence).padStart(padding, '0')}`;
}

const Counter = mongoose.model('OperationalCounters', counterSchema, 'operationalCounters');

module.exports = { Counter, companyToken, counterKey, formatSequence };
