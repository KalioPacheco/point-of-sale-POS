const Model = require('./model');

function addCategory(category) {
  const neCategories = new Model(category);
  return neCategories.save();
}

function listCategories(categoryId, companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (categoryId) {
      filter = {
        _id: categoryId,
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

async function updateCategory(categoryId, category) {
  const foundCategory = await Model.findOne({
    _id: categoryId,
  });

  const { name = '' } = category;

  if (name) {
    foundCategory.name = name;
  }

  foundCategory.updated = true;
  foundCategory.updatedAt = new Date();

  return foundCategory.save();
}

async function removeCategory(categoryId) {
  const foundCategory = await Model.findOne({
    _id: categoryId,
  });

  foundCategory.disable = true;

  return foundCategory.save();
}

module.exports = {
  add: addCategory,
  list: listCategories,
  update: updateCategory,
  remove: removeCategory,
};
