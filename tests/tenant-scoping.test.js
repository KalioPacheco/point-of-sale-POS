const test = require('node:test');
const assert = require('node:assert/strict');

function restore(target, key, original) {
  target[key] = original;
}

test('brands.store.update aplica filtro por company', async () => {
  const Model = require('../components/brands/model');
  const store = require('../components/brands/store');

  const originalFindOne = Model.findOne;
  let receivedFilter;

  Model.findOne = async (filter) => {
    receivedFilter = filter;
    return {
      name: 'Brand A',
      photo: '',
      save: async () => ({ id: 'saved-brand' }),
    };
  };

  try {
    await store.update('brand-1', { name: 'Updated' }, 'company-a');
    assert.equal(receivedFilter._id, 'brand-1');
    assert.equal(receivedFilter.company, 'company-a');
    assert.equal(receivedFilter.disable, false);
  } finally {
    restore(Model, 'findOne', originalFindOne);
  }
});

test('categories.store.remove aplica filtro por company', async () => {
  const Model = require('../components/categories/model');
  const store = require('../components/categories/store');

  const originalFindOne = Model.findOne;
  let receivedFilter;

  Model.findOne = async (filter) => {
    receivedFilter = filter;
    return {
      disable: false,
      save: async () => ({ id: 'saved-category' }),
    };
  };

  try {
    await store.remove('cat-1', 'company-a');
    assert.equal(receivedFilter._id, 'cat-1');
    assert.equal(receivedFilter.company, 'company-a');
    assert.equal(receivedFilter.disable, false);
  } finally {
    restore(Model, 'findOne', originalFindOne);
  }
});

test('products.store.addStock aplica filtro por company cuando viene del token', async () => {
  const productModel = require('../components/products/model');
  const store = require('../components/products/store');

  const originalFindOne = productModel.Product.findOne;
  const originalCreate = productModel.StockHistory.create;
  let receivedFilter;
  const companyId = '507f1f77bcf86cd799439011';

  productModel.Product.findOne = async (filter) => {
    receivedFilter = filter;
    return {
      _id: 'p1',
      name: 'Product A',
      stock: 4,
      save: async function save() {
        return this;
      },
    };
  };

  productModel.StockHistory.create = async () => ({ id: 'stock-history-1' });

  try {
    await store.addStock('p1', 3, 'user-1', 'manual', companyId);
    assert.equal(receivedFilter._id, 'p1');
    assert.equal(receivedFilter.company, companyId);
    assert.equal(receivedFilter.disable, false);
  } finally {
    restore(productModel.Product, 'findOne', originalFindOne);
    restore(productModel.StockHistory, 'create', originalCreate);
  }
});

test('taxes.store.updateTaxConfig aplica filtro _id + company', async () => {
  const taxModel = require('../components/taxes/model');
  const store = require('../components/taxes/store');

  const originalFindOneAndUpdate = taxModel.TaxConfig.findOneAndUpdate;
  let receivedFilter;

  taxModel.TaxConfig.findOneAndUpdate = (filter) => {
    receivedFilter = filter;
    return {
      populate: async () => ({ id: 'tax-1', company: 'company-a' }),
    };
  };

  try {
    await store.updateTaxConfig('tax-1', { name: 'IVA' }, 'company-a');
    assert.equal(receivedFilter._id, 'tax-1');
    assert.equal(receivedFilter.company, 'company-a');
    assert.equal(receivedFilter.isActive, true);
  } finally {
    restore(taxModel.TaxConfig, 'findOneAndUpdate', originalFindOneAndUpdate);
  }
});

test('taxes.store.getTaxConfig aplica filtro _id + company', async () => {
  const taxModel = require('../components/taxes/model');
  const store = require('../components/taxes/store');

  const originalFindOne = taxModel.TaxConfig.findOne;
  let receivedFilter;

  taxModel.TaxConfig.findOne = (filter) => {
    receivedFilter = filter;
    return {
      populate: async () => ({ id: 'tax-1', company: 'company-a' }),
    };
  };

  try {
    await store.getTaxConfig('tax-1', 'company-a');
    assert.equal(receivedFilter._id, 'tax-1');
    assert.equal(receivedFilter.company, 'company-a');
    assert.equal(receivedFilter.isActive, true);
  } finally {
    restore(taxModel.TaxConfig, 'findOne', originalFindOne);
  }
});
