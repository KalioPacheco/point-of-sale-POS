const mongoose = require('mongoose');

const { Schema } = mongoose;

const mySchema = new Schema(
  {
    name: Number,
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

const model = mongoose.model('Categories', mySchema, 'categories');
module.exports = model;
