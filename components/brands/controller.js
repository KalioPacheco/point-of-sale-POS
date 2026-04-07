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

function updateBrand(brandId, brand, companyId) {
  if (!brandId || !brand || !companyId) {
    return Promise.reject(
      `brandId or brand is undefined. BrandId is: ${brandId.toString()}, product is: ${JSON.stringify(
        brand,
      )}`,
    );
  }
  return store.update(brandId, brand, companyId);
}

function removeBrand(brandId, companyId) {
  if (!brandId || !companyId) {
    return Promise.reject('brandId is undefined');
  }
  return store.remove(brandId, companyId);
}

module.exports = {
  addBrand,
  listBrands,
  updateBrand,
  removeBrand,
};
