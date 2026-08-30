const mongoose = require('mongoose');
const Model = require('./model');

function addCategory(category) {
  const newCategory = new Model(category);
  return newCategory.save();
}

async function listCategories(categoryId, companyId) {
  const filter = {};
  
  if (categoryId) {
    filter._id = categoryId;
  }

  
  if (companyId && companyId !== 'default-company-id') {
    if (mongoose.Types.ObjectId.isValid(companyId)) {
      filter.company = companyId;
    }
  }

  filter.disable = false;

  const categories = await Model.find(filter)
    .populate('createdBy')
    .populate('company')
    .exec();
    
  return categories;
}

async function updateCategory(categoryId, category, companyId) {
  const foundCategory = await Model.findOne({
    _id: categoryId,
    company: companyId,
    disable: false,
  });

  if (!foundCategory) {
    throw new Error('Category not found');
  }

  const { name = '' } = category;

  if (name) {
    foundCategory.name = name;
  }

  foundCategory.updated = true;
  foundCategory.updatedAt = new Date();

  return foundCategory.save();
}

async function removeCategory(categoryId, companyId) {
  const foundCategory = await Model.findOne({
    _id: categoryId,
    company: companyId,
    disable: false,
  });

  if (!foundCategory) {
    throw new Error('Category not found');
  }

  foundCategory.disable = true;

  return foundCategory.save();
}

module.exports = {
  add: addCategory,
  list: listCategories,
  update: updateCategory,
  remove: removeCategory,
};
