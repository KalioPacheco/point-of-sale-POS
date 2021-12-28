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
  });

  const { name = '', address = {} } = type;

  if (name) {
    foundBrand.name = name;
  }
  if (address) {
    foundBrand.address = {
      ...foundBrand.address,
      number: {
        ...foundBrand.address.number,
        ...address.number,
      },
      geoPoint: {
        ...foundBrand.address.geoPoint,
        ...address.geoPoint,
      },
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

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addCompany,
  list: listCompanies,
  update: updateCompany,
  remove: removeCompany,
};
