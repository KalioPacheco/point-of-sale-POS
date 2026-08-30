const store = require('./store');

function addCategory(category) {
  if (!category) {
    return Promise.reject(
      `Category data is empty. User: ${JSON.stringify(category)}`,
    );
  }

  return store.add(category);
}

function listCategories(categoryId, companyId) {
  return store.list(categoryId, companyId);
}

function updateCategory(categoryId, category, companyId) {
  if (!categoryId || !category || !companyId) {
    return Promise.reject(
      `categoryId or category is undefined. categoryId is: ${categoryId}, category is: ${JSON.stringify(
        category,
      )}`,
    );
  }
  return store.update(categoryId, category, companyId);
}

function removeCategory(categoryId, companyId) {
  if (!categoryId || !companyId) {
    return Promise.reject('categoryId is undefined');
  }
  return store.remove(categoryId, companyId);
}

module.exports = {
  addCategory,
  listCategories,
  updateCategory,
  removeCategory,
};
