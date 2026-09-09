const Model = require('./model');
const Branch = require('../branches/model');
const CashRegister = require('../cashRegisters/model');

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
      .populate('branchAssignments.branch', 'code name active')
      .populate('branchAssignments.defaultCashRegister', 'code name branch active')
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
    foundBrand.photo = photo;
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

async function setBranchAssignments(userId, assignments, companyId, assignedBy) {
  if (!Array.isArray(assignments)) throw new Error('Las asignaciones de sucursal deben ser una lista');
  const user = await Model.findOne({ _id: userId, company: companyId, disable: false });
  if (!user) throw new Error('Usuario no encontrado en el scope de la empresa');

  const branchIds = assignments.map(item => String(item?.branchId || '')).filter(Boolean);
  if (new Set(branchIds).size !== branchIds.length) throw new Error('No se puede asignar una sucursal más de una vez');
  if (user.role !== 'admin' && assignments.every(item => item?.active === false)) {
    const error = new Error('Un vendedor o manager debe conservar al menos una sucursal activa');
    error.status = 400;
    throw error;
  }
  const branches = branchIds.length ? await Branch.find({ _id: { $in: branchIds }, company: companyId, active: true }).lean() : [];
  if (branches.length !== branchIds.length) throw new Error('Una o más sucursales no son válidas para la empresa');

  const registers = assignments.filter(item => item?.defaultCashRegisterId).length
    ? await CashRegister.find({
      _id: { $in: assignments.map(item => item.defaultCashRegisterId).filter(Boolean) },
      company: companyId,
      active: true,
    }).lean()
    : [];
  const registerById = new Map(registers.map(register => [String(register._id), register]));
  user.branchAssignments = assignments.map((item) => {
    const branchId = String(item.branchId);
    const registerId = item.defaultCashRegisterId ? String(item.defaultCashRegisterId) : null;
    if (registerId && String(registerById.get(registerId)?.branch) !== branchId) {
      throw new Error('La caja predeterminada debe pertenecer a la sucursal asignada');
    }
    return {
      branch: branchId,
      defaultCashRegister: registerId || undefined,
      active: item.active !== false,
      assignedBy,
      assignedAt: new Date(),
    };
  });
  user.updated = true;
  user.updatedAt = new Date();
  const saved = await user.save();
  await saved.populate('branchAssignments.branch', 'code name active');
  await saved.populate('branchAssignments.defaultCashRegister', 'code name branch active');
  return sanitizeUser(saved);
}

async function logout(userId) {
  if (!userId) {
    throw new Error('Usuario no autenticado');
  }

  const user = await Model.findByIdAndUpdate(userId, {
    $inc: { tokenVersion: 1 },
    $set: { updated: true, updatedAt: new Date() }
  }, { new: true });

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

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
  setBranchAssignments,
  logout,
};
