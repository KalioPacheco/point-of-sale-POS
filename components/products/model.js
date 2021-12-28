const mongoose = require('mongoose');

const { Schema } = mongoose;

const mySchema = new Schema({
  name: String,
  price: Number,
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
});

const model = mongoose.model('Products', mySchema, 'products');
module.exports = model;
