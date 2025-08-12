const mongoose = require('mongoose');

const { Schema } = mongoose;

const taxConfigSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  defaultRate: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
    required: true
  },
  createdBy: {
    type: Schema.ObjectId,
    ref: 'Users',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date
});

const productTaxSchema = new Schema({
  product: {
    type: Schema.ObjectId,
    ref: 'Products',
    required: true
  },
  taxConfig: {
    type: Schema.ObjectId,
    ref: 'TaxConfigs',
    required: true
  },
  customRate: {
    type: Number,
    required: true,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
    required: true
  },
  createdBy: {
    type: Schema.ObjectId,
    ref: 'Users',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date
});

const categoryTaxSchema = new Schema({
  category: {
    type: Schema.ObjectId,
    ref: 'Categories',
    required: true
  },
  taxConfig: {
    type: Schema.ObjectId,
    ref: 'TaxConfigs',
    required: true
  },
  defaultRate: {
    type: Number,
    required: true,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
    required: true
  },
  createdBy: {
    type: Schema.ObjectId,
    ref: 'Users',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date
});

taxConfigSchema.methods.calculateTax = function calculateTax(baseAmount, customRate = null) {
  const rate = customRate !== null ? customRate : this.defaultRate;
  
  if (this.type === 'percentage') {
    return (baseAmount * rate) / 100;
  }
  
  return rate;
};

productTaxSchema.index({ product: 1, company: 1 });
categoryTaxSchema.index({ category: 1, company: 1 });
taxConfigSchema.index({ company: 1, isActive: 1 });

const TaxConfig = mongoose.model('TaxConfigs', taxConfigSchema, 'taxConfigs');
const ProductTax = mongoose.model('ProductTaxes', productTaxSchema, 'productTaxes');
const CategoryTax = mongoose.model('CategoryTaxes', categoryTaxSchema, 'categoryTaxes');

module.exports = {
  TaxConfig,
  ProductTax,
  CategoryTax
};