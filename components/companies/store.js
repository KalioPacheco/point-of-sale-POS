const Model = require('./model');

function addCompany(company) {
  const newCompany = new Model(company);
  return newCompany.save();
}

function listCompanies(companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (companyId) {
      filter = {
        _id: companyId,
      };
    }

    filter.disable = false;

    Model.find(filter)
      .populate('createdBy')
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

async function updateCompany(companyId, type) {
  const foundBrand = await Model.findOne({
    _id: companyId,
    disable: false,
  });

  if (!foundBrand) {
    throw new Error('Empresa no encontrada');
  }

  const { name, rfc, address, disable } = type;

  if (name !== undefined) {
    foundBrand.name = name;
  }
  if (rfc !== undefined) foundBrand.rfc = rfc;
  if (typeof disable === 'boolean') foundBrand.disable = disable;
  if (address !== undefined) {
    foundBrand.address = {
      ...(foundBrand.address?.toObject?.() || foundBrand.address || {}),
      ...address,
      number: { ...(foundBrand.address?.number || {}), ...(address.number || {}) },
      geoPoint: { ...(foundBrand.address?.geoPoint || {}), ...(address.geoPoint || {}) },
    };
  }

  foundBrand.updated = true;
  foundBrand.updatedAt = new Date();

  return foundBrand.save();
}

async function removeCompany(companyId) {
  const foundBrand = await Model.findOne({
    _id: companyId,
  });

  if (!foundBrand) {
    throw new Error('Empresa no encontrada');
  }

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addCompany,
  list: listCompanies,
  update: updateCompany,
  remove: removeCompany,
};
