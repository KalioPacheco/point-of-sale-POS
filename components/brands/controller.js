const store = require('./store');

function addBrand(brand) {
  if (!brand) {
    return Promise.reject(`Brand data is empty. Brand: ${brand.toString()}`);
  }

  return store.add(brand);
}

function listBrands(brandId, companyId) {
  return store.list(brandId, companyId);
}

function updateBrand(brandId, brand) {
  if (!brandId || !brand) {
    return Promise.reject(
      `brandId or brand is undefined. BrandId is: ${brandId.toString()}, product is: ${JSON.stringify(
        brand,
      )}`,
    );
  }
  return store.update(brandId, brand);
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
