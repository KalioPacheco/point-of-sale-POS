const mongoose = require('mongoose');

const { Schema } = mongoose;

const mySchema = new Schema({

  total: {
    type: Number,
    required: true,
  },
  change: {
    type: Number,
    default: 0,
  },
  refund: {
    type: Boolean,
    default: false,
  },
  
  products: [
    {
      product: {
        type: Schema.ObjectId,
        ref: 'Products',
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        default: 1,
      },
      unitPrice: {
        type: Number,
        required: true,
      },
      subtotal: {
        type: Number,
        required: true,
      },
    },
  ],
  
  customer: {
    type: Schema.ObjectId,
    ref: 'Customer',
  },
  amountPaid: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'transfer', 'other'],
    default: 'cash',
  },
  
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
});


mySchema.pre('save', function updateFields(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
    this.updated = true;
  }
  next();
});

const model = mongoose.model('Sales', mySchema, 'sales');
module.exports = model;