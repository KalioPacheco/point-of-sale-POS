const passport = require('passport');
const Model = require('./model');

function sanitizeUser(userDocument) {
  if (!userDocument) {
    return userDocument;
  }

  const user = typeof userDocument.toObject === 'function'
    ? userDocument.toObject()
    : { ...userDocument };

  delete user.password;
  return user;
}

function addUser(user) {
  const payload = {
    ...user,
    company: user.companyId || user.company,
    typeUser: user.userTypeId || user.typeUser,
  };
  delete payload.companyId;
  delete payload.userTypeId;

  const newUser = new Model(payload);
  return new Promise((resolve, reject) => {
    Model.findOne({ userName: user.userName }, (err, exist) => {
      if (err) {
        reject(err);
        return;
      }
      if (exist) {
        reject('El usuario ya existe');
        return;
      }
      resolve(Promise.resolve(newUser.save()).then(saved => sanitizeUser(saved)));
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
      .select('-password')
      .populate('typeUser')
      .populate('company')
      .exec((err, populated) => {
        if (err) {
          reject(err);
          return false;
        }
        resolve(populated.map(item => sanitizeUser(item)));
        return true;
      });
  });
}

async function updateUser(userId, data, companyId) {
  const foundBrand = await Model.findOne({
    _id: userId,
    company: companyId,
    disable: false,
  });

  if (!foundBrand) {
    throw new Error('Usuario no encontrado en el scope de la empresa');
  }

  const {
    name = '',
    photo = '',
    lastNames = '',
    userName = '',
    disable,
    role = '',
    typeUser = '',
    userTypeId = '',
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
  if (userName) {
    foundBrand.userName = userName;
  }
  if (typeUser || userTypeId) {
    foundBrand.typeUser = userTypeId || typeUser;
  }
  if (role) {
    foundBrand.role = role;
  }
  if (typeof disable === 'boolean') {
    foundBrand.disable = disable;
  }

  foundBrand.privileges = {
    ...foundBrand.privileges,
    ...privileges,
  };
  foundBrand.updated = true;
  foundBrand.updatedAt = new Date();

  const savedUser = await foundBrand.save();
  return sanitizeUser(savedUser);
}

async function removeUser(userId, companyId) {
  const foundBrand = await Model.findOne({
    _id: userId,
    company: companyId,
  });

  if (!foundBrand) {
    throw new Error('Usuario no encontrado en el scope de la empresa');
  }

  foundBrand.disable = true;

  const savedUser = await foundBrand.save();
  return sanitizeUser(savedUser);
}

async function logout(userId) {
  if (!userId) {
    throw new Error('Usuario no autenticado');
  }

  const user = await Model.findById(userId);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.updated = true;
  user.updatedAt = new Date();

  await user.save();

  return {
    invalidated: true,
    message: 'Sesión invalidada correctamente',
  };
}

module.exports = {
  add: addUser,
  list: listUsers,
  update: updateUser,
  remove: removeUser,
  logout,
};
