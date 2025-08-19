const mongoose = require('mongoose');

const { Schema } = mongoose;

const productSnapshotSchema = new Schema({
  productId: {
    type: Schema.ObjectId,
    ref: 'Products',
    required: true
  },
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
    sku: String,
    description: String
  },

  subtotal: { type: Number, required: true }, 
  taxAmount: { type: Number, default: 0 },    
  total: { type: Number, required: true }     
}, { _id: false });

const mySchema = new Schema({
  total: Number,
  change: Number,
  refund: {
    type: Boolean,
    default: false,
  },
  
  products: [productSnapshotSchema],
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
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
  },

  subtotal: {
    type: Number,
    default: 0 
  },
  totalTaxes: {
    type: Number,
    default: 0 
  },
  
  couponCode: String,
  couponDiscount: {
    type: Number,
    default: 0
  },
  couponId: {
    type: Schema.ObjectId,
    ref: 'Coupons'
  },
  finalTotal: Number 
});


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

const model = mongoose.model('Sales', mySchema, 'sales');
module.exports = model;