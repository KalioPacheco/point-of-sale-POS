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

function updateCategory(categoryId, category) {
  if (!categoryId || !category) {
    return Promise.reject(
      `categoryId or category is undefined. categoryId is: ${categoryId}, category is: ${JSON.stringify(
        category,
      )}`,
    );
  }
  return store.update(categoryId, category);
}

function removeCategory(categoryId) {
  if (!categoryId) {
    return Promise.reject('categoryId is undefined');
  }
  return store.remove(categoryId);
}

module.exports = {
  addCategory,
  listCategories,
  updateCategory,
  removeCategory,
};
