const mongoose = require('mongoose');

const { Schema } = mongoose;

const mySchema = new Schema(
  {
    name: String,
    lastNames: String,
    description: String,
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
    photo: String,
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
  },
  { timestamps: true },
);

const model = mongoose.model('Customer', mySchema, 'customer');
module.exports = model;
