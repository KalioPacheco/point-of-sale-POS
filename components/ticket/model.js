const mongoose = require('mongoose');

const { Schema } = mongoose;

const ticketSchema = new Schema({
 
  ticketNumber: { type: String, unique: true, required: true },
  ticketType: { 
    type: String, 
    enum: ['sale', 'cashRegisterCut', 'refund', 'reprint'], 
    required: true 
  },
  
  saleId: { type: Schema.ObjectId, ref: 'Sales' },
  cutId: { type: Schema.ObjectId, ref: 'CashRegisterCuts' },
  
  storeInfo: {
    name: { type: String, default: 'Nombre de la Empresa' },
    address: { type: String, default: 'Dirección de la Empresa' },
    phone: String,
    taxId: String,
    email: String
  },
  
  
  transactionInfo: {
    date: { type: Date, default: Date.now },
    cashRegister: { type: String, default: 'CAJA-1' },
    cashier: {
      id: { type: Schema.ObjectId, ref: 'Users' },
      name: String
    },
    customer: {
      name: String,
      id: String,
      taxId: String
    }
  },
  
  items: [{
    productId: { type: Schema.ObjectId, ref: 'Products' }, 
    productName: String,
    quantity: Number,
    unitPrice: Number,
    discount: { type: Number, default: 0 },
    
    taxes: [{
      taxId: { type: Schema.ObjectId, ref: 'TaxConfigs' },
      name: String,
      type: { type: String, enum: ['percentage', 'fixed'] },
      rate: Number,
      amount: Number
    }],
    totalTaxes: { type: Number, default: 0 }, 
    totalPrice: Number,
    variant: {
      name: String,
      attributes: Schema.Types.Mixed
    }
  }],
  
  
  totals: {
    subtotal: { type: Number, default: 0 }, 
    totalTaxes: { type: Number, default: 0 }, 
    discounts: { type: Number, default: 0 },
    total: { type: Number, required: true } 
  },
  
  taxBreakdown: [{
    taxId: { type: Schema.ObjectId, ref: 'TaxConfigs' },
    name: String,
    type: String,
    totalAmount: Number
  }],
  
  
  payment: {
    method: { 
      type: String, 
      enum: ['efectivo', 'tarjeta', 'mixto', 'transferencia'],
      required: true 
    },
    details: {
      cashReceived: Number,
      change: Number,
      cardType: String,
      cardLast4: String,
      authCode: String,
      cashAmount: Number,
      cardAmount: Number,
      transferenceRef: String
    }
  },
  
  
  printInfo: {
    printed: { type: Boolean, default: false },
    printedAt: Date,
    printedBy: { type: Schema.ObjectId, ref: 'Users' },
    reprintCount: { type: Number, default: 0 },
    lastReprintAt: Date
  },
  
  format: {
    width: { type: String, enum: ['58mm', '80mm'], default: '80mm' },
    language: { type: String, default: 'es' },
    showLogo: { type: Boolean, default: false },
    showFooter: { type: Boolean, default: true },
    showTaxBreakdown: { type: Boolean, default: true } // 🆕 Mostrar desglose de impuestos
  },
  
  notes: String,
  status: { 
    type: String, 
    enum: ['active', 'cancelled', 'refunded'], 
    default: 'active' 
  },
  
  company: { type: Schema.ObjectId, ref: 'Companies' },
  disable: { type: Boolean, default: false }
  
}, { timestamps: true });

ticketSchema.statics.generateTicketNumber = async function generateTicketNumber(ticketType, cashRegister) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const typePrefix = ticketType.toUpperCase().slice(0, 3);
  const prefix = `${typePrefix}-${cashRegister}-${dateStr}`;
  
  const lastTicket = await this.findOne({
    ticketNumber: { $regex: `^${prefix}` }
  }).sort({ ticketNumber: -1 });
  
  let sequence = 1;
  if (lastTicket?.ticketNumber) {
    const parts = lastTicket.ticketNumber.split('-');
    const lastSequence = parseInt(parts[parts.length - 1], 10) || 0;
    sequence = lastSequence + 1;
  }
  
  return `${prefix}-${sequence.toString().padStart(4, '0')}`;
};

ticketSchema.methods.calculateTotals = function calculateTotals() {
  if (this.items && this.items.length > 0) {
    
    this.totals.subtotal = this.items.reduce((sum, item) => 
      sum + (item.subtotal || (item.unitPrice * item.quantity)), 0
    );
    
    this.totals.totalTaxes = this.items.reduce((sum, item) => 
      sum + (item.totalTaxes || 0), 0
    );
    
    this.totals.total = this.totals.subtotal + this.totals.totalTaxes - (this.totals.discounts || 0);
    
    this.generateTaxBreakdown();
    
    if (this.payment.method === 'efectivo' && this.payment.details?.cashReceived) {
      this.payment.details.change = Math.max(0, this.payment.details.cashReceived - this.totals.total);
    }
  }
  
  return this.totals.total;
};

ticketSchema.methods.generateTaxBreakdown = function generateTaxBreakdown() {
  const taxSummary = {};
  
  this.items.forEach(item => {
    if (item.taxes && item.taxes.length > 0) {
      item.taxes.forEach(tax => {
        const taxKey = tax.taxId ? tax.taxId.toString() : tax.name;
        if (!taxSummary[taxKey]) {
          taxSummary[taxKey] = {
            taxId: tax.taxId,
            name: tax.name,
            type: tax.type,
            totalAmount: 0
          };
        }
        taxSummary[taxKey].totalAmount += tax.amount;
      });
    }
  });
  
  this.taxBreakdown = Object.values(taxSummary).map(tax => ({
    ...tax,
    totalAmount: parseFloat(tax.totalAmount.toFixed(2))
  }));
};

ticketSchema.methods.markAsPrinted = function markAsPrinted(userId) {
  this.printInfo.printed = true;
  this.printInfo.printedAt = new Date();
  if (userId) {
    this.printInfo.printedBy = userId;
  }
  return this.save();
};
ticketSchema.methods.reprint = function reprint(userId) {
  this.printInfo.reprintCount += 1;
  this.printInfo.lastReprintAt = new Date();
  if (userId) {
    this.printInfo.printedBy = userId;
  }
  return this.save();
};

ticketSchema.index({ ticketNumber: 1 });
ticketSchema.index({ ticketType: 1, createdAt: -1 });
ticketSchema.index({ saleId: 1 });
ticketSchema.index({ cutId: 1 });
ticketSchema.index({ 'transactionInfo.cashRegister': 1, createdAt: -1 });
ticketSchema.index({ company: 1, disable: 1 });
ticketSchema.index({ 'taxBreakdown.taxId': 1 });
ticketSchema.index({ 'totals.totalTaxes': 1 });
module.exports = mongoose.model('Tickets', ticketSchema, 'tickets');