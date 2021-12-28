const store = require('./store');

function addBrand(brand) {
  if (!brand) {
    return Promise.reject(`Brand data is empty. Brand: ${brand.toString()}`);
  }

  return store.add(brand);
}

function listBrands(brandId) {
  return store.list(brandId);
}

function updateBrand(brandId, product) {
  if (!brandId || !product) {
    return Promise.reject(
      `brandId or product is undefined. BrandId is: ${brandId.toString()}, product is: ${product.toString()}`,
    );
  }
  return store.update(brandId, product);
}

function removeBrand(brandId) {
  if (!brandId) {
    return Promise.reject('brandId is undefined');
  }
  return store.remove(brandId);
}

module.exports = {
  addBrand,
  listBrands,
  updateBrand,
  removeBrand,
};
