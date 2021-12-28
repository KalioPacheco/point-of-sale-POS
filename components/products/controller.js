const store = require('./store');

function addProduct(product) {
  if (!product) {
    return Promise.reject(
      `Products data is empty. Product: ${product.toString()}`,
    );
  }

  return store.add(product);
}

function listProducts(userId, companyId) {
  return store.list(userId, companyId);
}

function updateProduct(productId, product) {
  if (!productId || !product) {
    return Promise.reject(
      `productId or product is undefined. productId is: ${productId}, product is: ${JSON.stringify(
        product,
      )}`,
    );
  }
  return store.update(productId, product);
}

function removeProduct(productId) {
  if (!productId) {
    return Promise.reject('productId is undefined');
  }
  return store.remove(productId);
}

module.exports = {
  addProduct,
  listProducts,
  updateProduct,
  removeProduct,
};
