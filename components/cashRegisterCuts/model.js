const mongoose = require('mongoose');

const { Schema } = mongoose;

const cashRegisterCutSchema = new Schema({

  cutNumber: { type: String, unique: true, required: true },
  cashRegister: { type: String, required: true },
  
  
  cashier: { type: Schema.ObjectId, ref: 'Users', required: true },
  administrator: { type: Schema.ObjectId, ref: 'Users', required: true },
  
 
  shiftStart: { type: Date, required: true },
  shiftEnd: { type: Date, required: true },
  cutDate: { type: Date, default: Date.now },
  

  salesSummary: {
    totalSales: { type: Number, default: 0 },
    totalRefunds: { type: Number, default: 0 },
    netSales: { type: Number, default: 0 },
    cash: { sales: { type: Number, default: 0 }, refunds: { type: Number, default: 0 }, net: { type: Number, default: 0 } },
    card: { sales: { type: Number, default: 0 }, refunds: { type: Number, default: 0 }, net: { type: Number, default: 0 } },
    mixed: { sales: { type: Number, default: 0 }, refunds: { type: Number, default: 0 }, net: { type: Number, default: 0 } },
    salesCount: { type: Number, default: 0 },
    refundsCount: { type: Number, default: 0 },
    salesIds: [{ type: Schema.ObjectId, ref: 'Sales' }]
  },
  

  cashControl: {
    expectedCash: { type: Number, required: true },
    actualCash: { type: Number, required: true },
    difference: { type: Number, required: true },
    initialCash: { type: Number, default: 0 }
  },
  
  
  notes: String,
  status: { type: String, enum: ['open', 'closed', 'reviewed'], default: 'closed' },
  company: { type: Schema.ObjectId, ref: 'Companies' },
  disable: { type: Boolean, default: false }
}, { timestamps: true });


cashRegisterCutSchema.statics.generateCutNumber = async function generateCutNumber(cashRegister) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `CUT-${cashRegister}-${dateStr}`;
  
  const lastCut = await this.findOne({
    cutNumber: { $regex: `^${prefix}` }
  }).sort({ cutNumber: -1 });
  
  let sequence = 1;
  if (lastCut?.cutNumber) {
    const parts = lastCut.cutNumber.split('-');
    const lastSequence = parseInt(parts[parts.length - 1], 10) || 0;
    sequence = lastSequence + 1;
  }
  
  return `${prefix}-${sequence.toString().padStart(3, '0')}`;
};

module.exports = mongoose.model('CashRegisterCuts', cashRegisterCutSchema, 'cashRegisterCuts');