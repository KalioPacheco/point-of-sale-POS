const mongoose = require('mongoose');

const { Schema } = mongoose;

const mySchema = new Schema({
  name: String,
  rfc: {
    type: String,
  },
  phone: String,
  email: String,
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
  ticketStoreConfig: {
    name: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
    },
    taxId: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      default: '',
    },
    updatedAt: Date,
  },
  featureFlags: {
    multiBranchFoundation: { type: Boolean, default: false },
    multiBranchInventory: { type: Boolean, default: false },
    promotionsV1: { type: Boolean, default: false },
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
