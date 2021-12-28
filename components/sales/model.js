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
});

const model = mongoose.model('Sales', mySchema, 'sales');
module.exports = model;
