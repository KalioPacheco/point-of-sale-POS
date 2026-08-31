const mongoose = require('mongoose');
const { Counter, counterKey, formatSequence } = require('../operationalCounters/model');

const { Schema } = mongoose;

const cashRegisterCutSchema = new Schema({
  cutNumber: { type: String, required: true },
  cashRegister: { type: String, required: true },
  companyName: String,
  
  cashier: { type: Schema.ObjectId, ref: 'Users', required: true },
  administrator: { type: Schema.ObjectId, ref: 'Users', required: true },
  shift: { type: Schema.ObjectId, ref: 'CashRegisterShifts', required: true },
 
  shiftStart: { type: Date, required: true },
  shiftEnd: { type: Date, required: true },
  cutDate: { type: Date, default: Date.now },
  
  salesSummary: {
    totalSales: { type: Number, default: 0 },
    totalRefunds: { type: Number, default: 0 },
    netSales: { type: Number, default: 0 },
    cash: { sales: { type: Number, default: 0 }, refunds: { type: Number, default: 0 }, net: { type: Number, default: 0 } },
    card: { sales: { type: Number, default: 0 }, refunds: { type: Number, default: 0 }, net: { type: Number, default: 0 } },
    transfer: { sales: { type: Number, default: 0 }, refunds: { type: Number, default: 0 }, net: { type: Number, default: 0 } },
    mixed: {
      sales: { type: Number, default: 0 },
      refunds: { type: Number, default: 0 },
      net: { type: Number, default: 0 },
      cashSales: { type: Number, default: 0 },
      cashRefunds: { type: Number, default: 0 },
      cashNet: { type: Number, default: 0 },
      cardSales: { type: Number, default: 0 },
      cardRefunds: { type: Number, default: 0 },
      cardNet: { type: Number, default: 0 }
    },
    salesCount: { type: Number, default: 0 },
    refundsCount: { type: Number, default: 0 },
    salesIds: [{ type: Schema.ObjectId, ref: 'Sales' }],
    
    subtotalAmount: { type: Number, default: 0 },  
    taxesAmount: { type: Number, default: 0 }     
  },
  
  cashControl: {
    expectedCash: { type: Number, required: true },
    actualCash: { type: Number, required: true },
    difference: { type: Number, required: true },
    initialCash: { type: Number, default: 0 },
  
    totalMovements: { type: Number, default: 0 },
  
    movementsBreakdown: {
      income: { type: Number, default: 0 },
      expenses: { type: Number, default: 0 }
    }
  },
  
  notes: String,
  status: { type: String, enum: ['open', 'closed', 'reviewed'], default: 'closed' },
  company: { type: Schema.ObjectId, ref: 'Companies' },
  disable: { type: Boolean, default: false }
}, { timestamps: true });

cashRegisterCutSchema.index({ company: 1, cutNumber: 1 }, { unique: true });
cashRegisterCutSchema.index({ company: 1, shift: 1 }, { unique: true });

cashRegisterCutSchema.statics.generateCutNumber = async function generateCutNumber(
  cashRegister,
  company,
  session = null
) {
  if (!company) throw new Error('Company is required to generate a cut number');
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `CUT-${cashRegister}-${dateStr}`;
  
  const lastCut = await this.findOne({
    company,
    cutNumber: { $regex: `^${prefix}` }
  }).sort({ cutNumber: -1 }).session(session).lean();
  const baseline = Number(lastCut?.cutNumber?.split('-').pop()) || 0;
  const sequence = await Counter.next(counterKey({
    kind: 'cut', company, cashRegister, date: dateStr
  }), baseline, session);
  return formatSequence(prefix, sequence, 3);
};

// FUNCIÓN CORREGIDA: Ahora filtra por cashRegister Y company
cashRegisterCutSchema.methods.calculateTaxes = async function calculateTaxes(session = null) {
  const Sale = require('../sales/model'); // eslint-disable-line global-require
  const Movement = require('../cashMovements/model'); // eslint-disable-line global-require
  
  // FILTRO CORREGIDO: Incluir cashRegister y hacer filtros más específicos
  const query = { shift: this.shift, disable: false };
  
  // filtro por cashRegister si existe
  if (this.cashRegister) {
    query.cashRegister = this.cashRegister;
  }

  
  
  if (this.company) {
    query.company = this.company;
  }
  
  console.log('DEBUG - Buscando ventas con filtro:', query);
  
  const sales = await Sale.find(query).session(session);

const movementQuery = {
  shift: this.shift,
  disable: false,
  type: { $nin: ['sale', 'refund'] },
  paymentMethod: 'cash'
};

if (this.cashRegister) {
  movementQuery.cashRegister = this.cashRegister;
}

if (this.company) {
  movementQuery.company = this.company;
}

const movements = await Movement.find(movementQuery).session(session);


let totalMovements = 0;
let income = 0;
let expenses = 0;

movements.forEach(mov => {
  const sign = mov.getMovementSign();

  if (sign > 0) {
    income += mov.amount;
  } else if (sign < 0) {
    expenses += mov.amount;
  }

  totalMovements += sign * mov.amount;
});

this.cashControl.totalMovements = totalMovements;
this.cashControl.movementsBreakdown = {
  income,
  expenses
};

this.cashControl.totalMovements = totalMovements;

  
  console.log(`DEBUG - Encontradas ${sales.length} ventas para el corte`);
  
  const refunds = await Sale.find({
    'refundInfo.shift': this.shift,
    company: this.company,
    disable: false
  }).session(session);
  let subtotal = 0;
  let taxes = 0;
  let totalSales = 0;
  let totalRefunds = 0;
  
  sales.forEach(sale => {
    const amount = sale.finalTotal ?? sale.total ?? 0;
    const method = ['cash', 'card', 'transfer', 'mixed'].includes(sale.payment?.method)
      ? sale.payment.method
      : 'cash';
    
    console.log(`DEBUG - Venta ${sale.id}: $${sale.total}`);
    
    subtotal += sale.subtotal || 0;
    taxes += sale.totalTaxes || 0;
    totalSales += amount;
    this.salesSummary[method].sales += amount;
    if (method === 'mixed') {
      this.salesSummary.mixed.cashSales += sale.payment?.cashAmount || 0;
      this.salesSummary.mixed.cardSales += sale.payment?.cardAmount || 0;
    }
  });

  refunds.forEach(sale => {
    const amount = sale.finalTotal ?? sale.total ?? 0;
    const method = ['cash', 'card', 'transfer', 'mixed'].includes(sale.payment?.method)
      ? sale.payment.method
      : 'cash';
    subtotal -= sale.subtotal || 0;
    taxes -= sale.totalTaxes || 0;
    totalRefunds += amount;
    this.salesSummary[method].refunds += amount;
    if (method === 'mixed') {
      this.salesSummary.mixed.cashRefunds += sale.payment?.cashAmount || 0;
      this.salesSummary.mixed.cardRefunds += sale.payment?.cardAmount || 0;
    }
  });

  ['cash', 'card', 'transfer', 'mixed'].forEach(method => {
    this.salesSummary[method].net =
      this.salesSummary[method].sales - this.salesSummary[method].refunds;
  });
  this.salesSummary.mixed.cashNet =
    this.salesSummary.mixed.cashSales - this.salesSummary.mixed.cashRefunds;
  this.salesSummary.mixed.cardNet =
    this.salesSummary.mixed.cardSales - this.salesSummary.mixed.cardRefunds;
  
  const total = totalSales - totalRefunds;
  console.log(`DEBUG - Totales calculados: Subtotal: $${subtotal}, Taxes: $${taxes}, Total: $${total}`);
  
  this.salesSummary.subtotalAmount = subtotal;
  this.salesSummary.taxesAmount = taxes;
  this.salesSummary.netSales = total;
  this.salesSummary.totalSales = totalSales;
  this.salesSummary.totalRefunds = totalRefunds;
  this.salesSummary.salesCount = sales.length;
  this.salesSummary.refundsCount = refunds.length;
  this.salesSummary.salesIds = sales.map(s => s.id);
  
  return { subtotal, taxes, total };
};

cashRegisterCutSchema.methods.getFormatWithTaxes = function getFormatWithTaxes() {
  const lines = [];
  
  lines.push('=================================');
  lines.push('        CORTE DE CAJA');
  lines.push('=================================');
  lines.push(`Corte: ${this.cutNumber}`);
  lines.push(`Fecha: ${new Date(this.cutDate).toLocaleDateString()}`);
  lines.push(`Período: ${new Date(this.shiftStart).toLocaleTimeString()} - ${new Date(this.shiftEnd).toLocaleTimeString()}`);
  lines.push('---------------------------------');
  
  lines.push('RESUMEN DE VENTAS:');
  lines.push(`Ventas: ${' '.repeat(20)} ${this.salesSummary.salesCount}`);
  lines.push(`Subtotal: ${' '.repeat(15)} $${this.salesSummary.subtotalAmount.toFixed(2)}`);
  
  if (this.salesSummary.taxesAmount > 0) {
    lines.push(`Impuestos: ${' '.repeat(14)} $${this.salesSummary.taxesAmount.toFixed(2)}`);
  }
  
  lines.push('---------------------------------');
  lines.push(`TOTAL: ${' '.repeat(18)} $${this.salesSummary.netSales.toFixed(2)}`);
  lines.push('=================================');
 
  lines.push('CONTROL DE EFECTIVO:');
  lines.push(`Esperado: ${' '.repeat(15)} $${this.cashControl.expectedCash.toFixed(2)}`);
  lines.push(`Real: ${' '.repeat(19)} $${this.cashControl.actualCash.toFixed(2)}`);
  lines.push(`Diferencia: ${' '.repeat(13)} $${this.cashControl.difference.toFixed(2)}`);
  
  return lines.join('\n');
};

module.exports = mongoose.model('CashRegisterCuts', cashRegisterCutSchema, 'cashRegisterCuts');
