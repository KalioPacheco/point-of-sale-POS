const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const { Schema } = mongoose;

const mySchema = new Schema(
  {
    name: String,
    lastNames: String,
    userName: {
      type: String,
      unique: true,
      lowercase: true,
      required: true,
    },
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
    createdBy: {
      type: Schema.ObjectId,
      ref: 'Users',
    },
    password: {
      type: String,
      required: true,
    },
    typeUser: {
      type: Schema.ObjectId,
      default: '61c954203d4e629aa12f69ca',
      ref: 'UsersTypes',
    },
    company: {
      type: Schema.ObjectId,
      ref: 'Companies',
    },
    privileges: {
      full: {
        type: Boolean,
        default: true,
      },
    },
  },
  { timestamps: true },
);

mySchema.pre('save', function (next) {
  const user = this;
  if (!user.isModified('password')) {
    next();
  } else {
    bcrypt.genSalt(10, (err, salt) => {
      if (err) {
        next(err);
      }
      bcrypt.hash(user.password, salt, (error, hash) => {
        if (error) {
          next(error);
        }
        user.password = hash;
        next();
      });
    });
  }
});

mySchema.methods.checkPassword = function (password, cb) {
  bcrypt.compare(password, this.password, (err, isSame) => {
    if (err) {
      cb(err);
    } else {
      cb(null, isSame);
    }
  });
};

const model = mongoose.model('Users', mySchema, 'users');
module.exports = model;
