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