const mongoose = require('mongoose');

const { Schema } = mongoose;

const mySchema = new Schema({
  name: String,
  rfc: {
    type: String,
  },
  address: {
    street: String,
    number: {
      ext: String,
      int: String,
    },
    city: String,
    state: String,
    country: String,
    geoPoint: {
      lat: String,
      lng: String,
    },
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
});

const model = mongoose.model('Companies', mySchema, 'companies');
module.exports = model;
