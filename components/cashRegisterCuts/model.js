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
    salesIds: [{ type: Schema.ObjectId, ref: 'Sales' }],
    
    subtotalAmount: { type: Number, default: 0 },  
    taxesAmount: { type: Number, default: 0 }     
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
  if (lastCut && lastCut.cutNumber) {
    const parts = lastCut.cutNumber.split('-');
    const lastSequence = parseInt(parts[parts.length - 1], 10) || 0;
    sequence = lastSequence + 1;
  }
  
  return `${prefix}-${sequence.toString().padStart(3, '0')}`;
};

// FUNCIÓN CORREGIDA: Ahora filtra por cashRegister Y company
cashRegisterCutSchema.methods.calculateTaxes = async function calculateTaxes() {
  const Sale = require('../sales/model'); // eslint-disable-line global-require
  
  // FILTRO CORREGIDO: Incluir cashRegister y hacer filtros más específicos
  const query = {
    createdAt: { $gte: this.shiftStart, $lte: this.shiftEnd },
    disable: false
  };
  
  // Agregar filtro por cashRegister si existe
  if (this.cashRegister) {
    query.cashRegister = this.cashRegister;
  }
  
  
  if (this.company) {
    query.company = this.company;
  }
  
  console.log('DEBUG - Buscando ventas con filtro:', query);
  
  const sales = await Sale.find(query);
  
  console.log(`DEBUG - Encontradas ${sales.length} ventas para el corte`);
  
  let subtotal = 0;
  let taxes = 0;
  let total = 0;
  
  sales.forEach(sale => {
    const isRefund = sale.refund || false;
    const multiplier = isRefund ? -1 : 1;
    
    console.log(`DEBUG - Venta ${sale.id}: $${sale.total} (refund: ${isRefund})`);
    
    subtotal += (sale.subtotal || 0) * multiplier;
    taxes += (sale.totalTaxes || 0) * multiplier;
    total += (sale.total || 0) * multiplier;
  });
  
  console.log(`DEBUG - Totales calculados: Subtotal: $${subtotal}, Taxes: $${taxes}, Total: $${total}`);
  
  this.salesSummary.subtotalAmount = subtotal;
  this.salesSummary.taxesAmount = taxes;
  this.salesSummary.netSales = total;
  this.salesSummary.salesCount = sales.filter(s => !s.refund).length;
  this.salesSummary.refundsCount = sales.filter(s => s.refund).length;
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