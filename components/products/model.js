const mongoose = require('mongoose');

const { Schema } = mongoose;


const variantSchema = new Schema({
  name: {
    type: String,
    required: true  
  },
  type: {
    type: String,
    enum: ['color', 'size', 'model', 'material', 'other'],
    default: 'other'  
  },
  value: {
    type: String,
    required: true 
  },
  sku: {
    type: String,
    unique: true,
    sparse: true  
  },
  price: {
    type: Number,
    default: 0  
  },
  stock: {
    type: Number,
    default: 0  
  },
  photo: String,  
  disabled: {
    type: Boolean,
    default: false  
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,

  stockHistory: [{    // hstorial de stock específico para cada variante
    quantity: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['entrada', 'salida', 'ajuste'],
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    addedBy: {
      type: Schema.ObjectId,
      ref: 'Users',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    previousStock: {
      type: Number,
      required: true
    },
    newStock: {
      type: Number,
      required: true
    }
  }]
});

const mySchema = new Schema({
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
  unit: {
    type: String,
    enum: ['pieza', 'mililitro', 'gramo', 'kilo'],
    required: true,
    default: 'pieza',
  },
  // campos agregados para el hirtorial  
  stockHistory: [{
    quantity: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['entrada', 'salida', 'ajuste'],
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    addedBy: {
      type: Schema.ObjectId,
      ref: 'Users',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    previousStock: {
      type: Number,
      required: true
    },
    newStock: {
      type: Number,
      required: true
    }
  }],
  
  variants: [variantSchema], 
 
  hasVariants: {
    type: Boolean,
    default: false 
  }
 
});

const model = mongoose.model('Products', mySchema, 'products');
module.exports = model;