const Model = require('./model');

function addBrand(brand) {
  const newBrand = new Model(brand);
  return newBrand.save();
}

function listBrands(brandId, companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (brandId) {
      filter = {
        _id: brandId,
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

async function updateBrand(brandId, data) {
  const foundBrand = await Model.findOne({
    _id: brandId,
  });

  const { name = '', photo = '' } = data;

  if (name) {
    foundBrand.name = name;
  }
  if (photo) {
    foundBrand.photo = name;
  }

  foundBrand.updated = true;
  foundBrand.updatedAt = new Date();

  return foundBrand.save();
}

async function removeBrand(brandId) {
  const foundBrand = await Model.findOne({
    _id: brandId,
  });

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addBrand,
  list: listBrands,
  update: updateBrand,
  remove: removeBrand,
};
