const mongoose = require('mongoose');
const Model = require('./model');

function addBrand(brand) {
  const newBrand = new Model(brand);
  return newBrand.save();
}

async function listBrands(brandId, companyId) {
  const filter = {};
  
  if (brandId) {
    filter._id = brandId;
  }

  if (companyId && companyId !== 'default-company-id') {
    if (mongoose.Types.ObjectId.isValid(companyId)) {
      filter.company = companyId;
    }
  }

  filter.disable = false;

  const brands = await Model.find(filter)
    .populate('createdBy')
    .populate('company')
    .exec();
    
  return brands;
}

async function updateBrand(brandId, data, companyId) {
  const foundBrand = await Model.findOne({
    _id: brandId,
    company: companyId,
    disable: false,
  });

  if (!foundBrand) {
    throw new Error('Brand not found');
  }

  const { name = '', photo = '' } = data;

  if (name) {
    foundBrand.name = name;
  }
  if (photo) {
    foundBrand.photo = photo; 
  }

  foundBrand.updated = true;
  foundBrand.updatedAt = new Date();

  return foundBrand.save();
}

async function removeBrand(brandId, companyId) {
  const foundBrand = await Model.findOne({
    _id: brandId,
    company: companyId,
    disable: false,
  });

  if (!foundBrand) {
    throw new Error('Brand not found');
  }

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addBrand,
  list: listBrands,
  update: updateBrand,
  remove: removeBrand,
};