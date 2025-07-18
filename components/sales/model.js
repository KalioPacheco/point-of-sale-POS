const mongoose = require('mongoose');

const { Schema } = mongoose;
const mySchema = new Schema({
  total: Number,
  change: Number,
  refund: {
    type: Boolean,
    default: false,
  },
  products: [
    {
      type: Schema.ObjectId,
      ref: 'Products',
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  disable: {
    type: Boolean,
    default: false,
  },
  updated: {
    type: Boolean,
    default: false,
  },
  updatedAt: Date,
  createdBy: {
    type: Schema.ObjectId,
    ref: 'Users',
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
  },

  itemsPOS: [{
    product: {
      type: Schema.ObjectId,
      ref: 'Products'
    },
    variant: {
      variantId: Schema.ObjectId,
      name: String,
      attributes: Schema.Types.Mixed
    },
    productName: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    stockReduced: {
      type: Boolean,
      default: false
    }
  }],
  cashRegister: {
    type: String,
    default: 'CAJA-1'
  },
  
  saleNumber: String,
  
  subtotal: Number,
  taxes: {
    type: Number,
    default: 0
  },
  
  paymentMethod: {
    type: String,
    enum: ['efectivo', 'tarjeta', 'mixto']
  },
  paymentDetails: {
    cashReceived: Number,
    change: Number,
    cardType: String,
    cardLast4: String,
    authCode: String,
    cashAmount: Number,
    cardAmount: Number
  },
  
  status: {
    type: String,
    enum: ['completed', 'cancelled', 'refunded'],
    default: 'completed'
  },

  ticket: {
    printed: {
      type: Boolean,
      default: false
    },
    printedAt: Date,
    ticketNumber: String,
    cashierName: String,
    storeName: String,
    storeAddress: String,
    taxId: String
  },

  refundReason: String,
  refundAmount: Number,
  refundDate: Date,
  customerName: String

});

mySchema.statics.generateSaleNumber = async function generateSaleNumber(cashRegister) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `${cashRegister}-${dateStr}`;
  
  const lastSale = await this.findOne({
    saleNumber: { $regex: `^${prefix}` }
  }).sort({ saleNumber: -1 });
  
  let sequence = 1;
  if (lastSale && lastSale.saleNumber) {
    const parts = lastSale.saleNumber.split('-');
    const lastSequence = parseInt(parts[parts.length - 1], 10) || 0;
    sequence = lastSequence + 1;
  }
  
  return `${prefix}-${sequence.toString().padStart(4, '0')}`;
};

mySchema.methods.calculateTotal = function calculateTotal() {
  if (this.itemsPOS && this.itemsPOS.length > 0) {
    this.subtotal = this.itemsPOS.reduce((sum, item) => sum + item.totalPrice, 0);
    this.total = this.subtotal + (this.taxes || 0);
    
    if (this.paymentMethod === 'efectivo' && this.paymentDetails?.cashReceived) {
      this.paymentDetails.change = Math.max(0, this.paymentDetails.cashReceived - this.total);
      this.change = this.paymentDetails.change; 
    }
  }
  
  return this.total;
};

const model = mongoose.model('Sales', mySchema, 'sales');
module.exports = model;