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
  createdBy: String,
  minSell: {
    quantity: Number,
    measure: String,
  },
});

const model = mongoose.model('Products', mySchema, 'products');
module.exports = model;
