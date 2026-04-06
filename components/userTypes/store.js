const Model = require('./model');

function addType(type) {
  const payload = {
    ...type,
    company: type.companyId || type.company,
  };
  delete payload.companyId;

  const newUser = new Model(payload);
  return newUser.save();
}

function listTypes(typeId, companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (typeId) {
      filter = {
        _id: typeId,
      };
    }

    filter.company = companyId;
    filter.disable = false;

    Model.find(filter)
      .populate('createdBy')
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

async function updateType(typeId, type, companyId) {
  const foundBrand = await Model.findOne({
    _id: typeId,
    company: companyId,
    disable: false,
  });

  if (!foundBrand) {
    throw new Error('Tipo de usuario no encontrado en el scope de la empresa');
  }

  const { name = '' } = type;

  if (name) {
    foundBrand.name = name;
  }

  foundBrand.updated = true;
  foundBrand.updatedAt = new Date();

  return foundBrand.save();
}

async function removeType(typeId, companyId) {
  const foundBrand = await Model.findOne({
    _id: typeId,
    company: companyId,
  });

  if (!foundBrand) {
    throw new Error('Tipo de usuario no encontrado en el scope de la empresa');
  }

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addType,
  list: listTypes,
  update: updateType,
  remove: removeType,
};
