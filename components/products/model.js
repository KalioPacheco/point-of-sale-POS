const mongoose = require('mongoose');

const { Schema } = mongoose;

const variantSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    sparse: true 
  },

  attributes: {
    size: String,       
    color: String,       
    capacity: String,    
    material: String,    
    model: String,       
    custom: Schema.Types.Mixed 
  },
  
  stock: {
    type: Number,
    default: 0,
    min: 0
  },
  
  price: {
    type: Number,
    default: null
  },
  
  active: {
    type: Boolean,
    default: true
  },
  
  photo: String,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

const stockHistorySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.ObjectId,
    ref: 'Products',
    required: true,
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'Users'
  },
  type: {
    type: String,
    enum: ['add', 'reduce', 'set'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  previousStock: {
    type: Number,
  },
  newStock: {
    type: Number,
  },
  reason: {
    type: String,
    default: 'Manual adjustment',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const productSchema = new Schema({
  name: String,
  price: Number,
  folio: {
    type: Number,
    default: 1,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  brand: {
    type: Schema.ObjectId,
    ref: 'Brands',
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
    required: false
  },
  description: String,
  stock: Number, 
  photo: String,
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
  minSell: {
    quantity: Number,
    measure: String,
  },
  categories: [
    {
      type: Schema.ObjectId,
      ref: 'Categories',
    },
  ],
  
 
  hasVariants: {
    type: Boolean,
    default: false 
  },
  variants: [variantSchema],
  

  taxRate: {
    type: Number,
    default: 0,
    min: 0 
  },
  taxExempt: {
    type: Boolean,
    default: false
  }
});

const StockHistory = mongoose.model(
  'StockHistory',
  stockHistorySchema,
  'stock_history'
);

productSchema.methods.getTotalStock = function getTotalStock() {
  if (!this.hasVariants) {
    return this.stock || 0;
  }
  
  const variantStock = this.variants
    .filter(variant => variant.active)
    .reduce((total, variant) => total + (variant.stock || 0), 0);
    
  return variantStock;
};

productSchema.methods.hasStock = function hasStock() {
  return this.getTotalStock() > 0;
};


productSchema.methods.getPriceWithTax = function getPriceWithTax() {
  if (this.taxExempt || !this.taxRate) {
    return this.price || 0;
  }
  const tax = (this.price * this.taxRate) / 100;
  return (this.price || 0) + tax;
};

productSchema.methods.getTaxAmount = function getTaxAmount() {
  if (this.taxExempt || !this.taxRate) {
    return 0;
  }
  return ((this.price || 0) * this.taxRate) / 100;
};

const model = mongoose.model('Products', productSchema, 'products');
module.exports = {
  Product: model,
  StockHistory
};