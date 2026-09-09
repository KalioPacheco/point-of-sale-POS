const mongoose = require('mongoose');

const { Schema } = mongoose;

const productSnapshotSchema = new Schema({
  productId: {
    type: Schema.ObjectId,
    ref: 'Products',
    required: true
  },
  variantId: { type: Schema.ObjectId },
  variantName: String,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },

  priceSnapshot: {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxExempt: { type: Boolean, default: false },
    snapshotDate: { type: Date, default: Date.now },
 
    brand: String,
    category: String,
    categoryIds: [{ type: Schema.ObjectId, ref: 'Categories' }],
    sku: String,
    description: String
  },

  subtotal: { type: Number, required: true }, 
  discountAmount: { type: Number, default: 0, min: 0 },
  taxableSubtotal: { type: Number, min: 0 },
  taxAmount: { type: Number, default: 0 },    
  total: { type: Number, required: true }     
}, { _id: false });

const promotionAllocationSchema = new Schema({
  lineIndex: Number,
  productId: { type: Schema.ObjectId, ref: 'Products' },
  variantId: { type: Schema.ObjectId },
  quantity: Number,
  grossSubtotal: Number,
  discount: Number,
  taxableSubtotal: Number,
  taxRate: Number,
  taxAmount: Number,
  total: Number,
}, { _id: false });

const appliedPromotionSchema = new Schema({
  promotionId: { type: Schema.ObjectId, ref: 'Promotions', required: true },
  version: { type: Number, required: true },
  name: String,
  priority: Number,
  taxPolicyVersion: { type: String, required: true },
  benefit: Schema.Types.Mixed,
  conditions: Schema.Types.Mixed,
  discount: { type: Number, required: true, min: 0 },
  lineAllocations: { type: [promotionAllocationSchema], default: [] },
  cartAllocation: { type: Number, default: 0, min: 0 },
}, { _id: false });

const mySchema = new Schema({
  total: { type: Number, required: true, min: 0 },
  change: { type: Number, required: true, min: 0, default: 0 },
  refund: {
    type: Boolean,
    default: false,
  },

  idempotencyKey: {
    type: String,
    required: true
  },
  requestFingerprint: String,
  
  products: {
    type: [productSnapshotSchema],
    required: true,
    validate: {
      validator: products => Array.isArray(products) && products.length > 0,
      message: 'Sale must contain at least one product'
    }
  },
  oldProducts: [
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
    required: true,
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
    required: true,
  },
  branch: { type: Schema.ObjectId, ref: 'Branches', index: true },
  cashRegisterId: { type: Schema.ObjectId, ref: 'CashRegisters', index: true },
  cashRegister: { type: String, required: true },
  shift: { type: Schema.ObjectId, ref: 'CashRegisterShifts', required: true },
  customer: { type: Schema.ObjectId, ref: 'Customers' },
  status: {
    type: String,
    enum: ['confirmed', 'refunded', 'cancelled'],
    default: 'confirmed'
  },
  refundInfo: {
    refundedAt: Date,
    refundedBy: { type: Schema.ObjectId, ref: 'Users' },
    reason: String,
    shift: { type: Schema.ObjectId, ref: 'CashRegisterShifts' },
    branch: { type: Schema.ObjectId, ref: 'Branches' },
    cashRegisterId: { type: Schema.ObjectId, ref: 'CashRegisters' },
    cashRegister: String
  },
  payment: {
    method: {
      type: String,
      enum: ['cash', 'card', 'transfer', 'mixed'],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    cashReceived: { type: Number, min: 0 },
    change: { type: Number, min: 0, default: 0 },
    reference: String,
    cashAmount: { type: Number, min: 0, default: 0 },
    cardAmount: { type: Number, min: 0, default: 0 }
  },

  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  totalTaxes: {
    type: Number,
    required: true,
    min: 0
  },
  // `grossSubtotal` preserves the catalog amount.  `subtotal` is the taxable
  // base after a V1 promotion has been allocated by line.
  grossSubtotal: { type: Number, min: 0 },
  taxPolicyVersion: { type: String, default: 'legacy_coupon_v1' },
  promotionDiscount: { type: Number, default: 0, min: 0 },
  appliedPromotions: { type: [appliedPromotionSchema], default: [] },
  promotionOutcome: Schema.Types.Mixed,
  
  couponCode: String,
  couponDiscount: {
    type: Number,
    default: 0
  },
  couponId: {
    type: Schema.ObjectId,
    ref: 'Coupons'
  },
  couponSnapshot: Schema.Types.Mixed,
  finalTotal: { type: Number, required: true, min: 0 }
});

mySchema.index({ company: 1, idempotencyKey: 1 }, { unique: true });
mySchema.index({ company: 1, branch: 1, createdAt: -1, _id: -1 });


mySchema.methods.calculateTaxesFromSnapshots = function calculateTaxesFromSnapshots(couponData = null) {
  let subtotal = 0;
  let taxes = 0;
  
  if (this.products && this.products.length > 0) {
    this.products.forEach(item => {
      subtotal += item.subtotal || 0;
      taxes += item.taxAmount || 0;
    });
  }
  
  this.subtotal = subtotal;
  this.totalTaxes = taxes;
  this.total = subtotal + taxes;

  if (couponData && couponData.discountAmount) {
    this.couponCode = couponData.code;
    this.couponDiscount = couponData.discountAmount;
    this.couponId = couponData.id;
    this.finalTotal = this.total - couponData.discountAmount;
  } else {
    this.finalTotal = this.total;
  }
  
  return {
    subtotal: this.subtotal,
    taxes: this.totalTaxes,
    total: this.total,
    couponDiscount: this.couponDiscount || 0,
    finalTotal: this.finalTotal
  };
};

// Método para obtener productos con datos históricos
mySchema.methods.getProductsWithHistoricalData = function getProductsWithHistoricalData() {
  return this.products.map(item => ({
    productId: item.productId,
    quantity: item.quantity,
    name: item.priceSnapshot.name,
    price: item.priceSnapshot.price,
    cost: item.priceSnapshot.cost,
    taxRate: item.priceSnapshot.taxRate,
    taxExempt: item.priceSnapshot.taxExempt,
    subtotal: item.subtotal,
    taxAmount: item.taxAmount,
    total: item.total,
    snapshotDate: item.priceSnapshot.snapshotDate
  }));
};

mySchema.methods.hasHistoricalData = function hasHistoricalData() {
  return this.products && this.products.length > 0 && 
         this.products.every(item => item.priceSnapshot && item.priceSnapshot.name);
};

mySchema.methods.calculateTaxes = function calculateTaxes(productsList, couponData = null) {
  let subtotal = 0;
  let taxes = 0;
  
  if (productsList && productsList.length > 0) {
    productsList.forEach(item => {
      const itemSubtotal = (item.price || 0) * (item.quantity || 1);
      const itemTax = item.taxExempt ? 0 : (itemSubtotal * (item.taxRate || 0)) / 100;
      
      subtotal += itemSubtotal;
      taxes += itemTax;
    });
  }
  
  this.subtotal = subtotal;
  this.totalTaxes = taxes;
  this.total = subtotal + taxes;
  
  if (couponData && couponData.discountAmount) {
    this.couponCode = couponData.code;
    this.couponDiscount = couponData.discountAmount;
    this.couponId = couponData.id;
    this.finalTotal = this.total - couponData.discountAmount;
  } else {
    this.finalTotal = this.total;
  }
  
  return {
    subtotal: this.subtotal,
    taxes: this.totalTaxes,
    total: this.total,
    couponDiscount: this.couponDiscount || 0,
    finalTotal: this.finalTotal
  };
};

mySchema.index({ company: 1, disable: 1, createdAt: -1, _id: -1 });
mySchema.index({ company: 1, disable: 1, 'refundInfo.refundedAt': -1 });
const model = mongoose.model('Sales', mySchema, 'sales');
module.exports = model;
