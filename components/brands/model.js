const mongoose = require('mongoose');

const { Schema } = mongoose;

const mySchema = new Schema({
  name: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
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
});

const model = mongoose.model('Brands', mySchema, 'brands');
module.exports = model;
