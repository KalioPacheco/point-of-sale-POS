const passport = require('passport');
const Model = require('./model');

function addUser(user) {
  const newUser = new Model(user);
  return new Promise((resolve, reject) => {
    Model.findOne({ userName: user.userName }, (err, exist) => {
      if (exist) {
        reject('El usuario ya existe');
      }
      resolve(Promise.resolve(newUser.save()));
    });
  });
}

function listUsers(userId, companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (userId) {
      filter = {
        _id: userId,
      };
    }

    filter.company = companyId;
    filter.disable = false;

    Model.find(filter)
      .populate('typeUser')
      .populate('company')
      .exec((err, populated) => {
        if (err) {
          reject(err);
          return false;
        }
        resolve(populated);
        return true;
      });
  });
}

async function updateUser(userId, data) {
  const foundBrand = await Model.findOne({
    _id: userId,
  });

  const {
    name = '',
    photo = '',
    lastNames = '',
    typeUser = '',
    privileges = {},
  } = data;

  if (name) {
    foundBrand.name = name;
  }
  if (photo) {
    foundBrand.photo = name;
  }
  if (lastNames) {
    foundBrand.lastNames = lastNames;
  }
  if (typeUser) {
    foundBrand.typeUser = typeUser;
  }

  foundBrand.privileges = {
    ...foundBrand.privileges,
    ...privileges,
  };
  foundBrand.updated = true;
  foundBrand.updatedAt = new Date();

  return foundBrand.save();
}

async function removeUser(userId) {
  const foundBrand = await Model.findOne({
    _id: userId,
  });

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addUser,
  list: listUsers,
  update: updateUser,
  remove: removeUser,
};