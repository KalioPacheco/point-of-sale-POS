const Model = require('./model');

function addBrand(brand) {
  const newBrand = new Model(brand);
  return newBrand.save();
}

function listBrands(brandId) {
  let filter = {};
  if (brandId) {
    filter = {
      _id: brandId,
    };
  }

  filter.disable = false;

  return Model.find(filter);
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
