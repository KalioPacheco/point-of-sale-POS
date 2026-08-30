const store = require('./store');

function addTaxConfig(taxData) {
  if (!taxData || !taxData.name || !taxData.company) {
    return Promise.reject(new Error('Tax config data is incomplete. Name and company are required.'));
  }

  return store.addTaxConfig(taxData);
}

function listTaxConfigs(companyId) {
  if (!companyId) {
    return Promise.reject(new Error('Company ID is required'));
  }

  return store.listTaxConfigs(companyId);
}

function getTaxConfig(taxConfigId) {
  if (!taxConfigId) {
    return Promise.reject(new Error('Tax config ID is required'));
  }

  return store.getTaxConfig(taxConfigId);
}

function updateTaxConfig(taxConfigId, updateData) {
  if (!taxConfigId || !updateData) {
    return Promise.reject(new Error('Tax config ID and update data are required'));
  }

  return store.updateTaxConfig(taxConfigId, updateData);
}

function removeTaxConfig(taxConfigId) {
  if (!taxConfigId) {
    return Promise.reject(new Error('Tax config ID is required'));
  }

  return store.removeTaxConfig(taxConfigId);
}

async function setProductTax(productId, taxConfigId, customRate, companyId, userId) {
  if (!productId || !taxConfigId || customRate === undefined || !companyId) {
    return Promise.reject(new Error('Product ID, tax config ID, custom rate, and company ID are required'));
  }

  if (customRate < 0) {
    return Promise.reject(new Error('Custom rate cannot be negative'));
  }

  const result = await store.setProductTax(
    productId,
    taxConfigId,
    customRate,
    companyId,
    userId
  );
  const { Product } = require('../products/model'); // eslint-disable-line global-require
  const rate = Number(result.customRate ?? result.taxConfig?.defaultRate ?? 0);
  await Product.updateOne(
    { _id: productId, company: companyId },
    { $set: { taxRate: rate, taxExempt: rate <= 0, updated: true, updatedAt: new Date() } }
  );
  return result;
}

function getProductTaxes(productId, companyId) {
  if (!productId || !companyId) {
    return Promise.reject(new Error('Product ID and company ID are required'));
  }

  return store.getProductTaxes(productId, companyId);
}

async function removeProductTax(productId, taxConfigId, companyId) {
  if (!productId || !taxConfigId || !companyId) {
    return Promise.reject(new Error('Product ID, tax config ID, and company ID are required'));
  }

  const result = await store.removeProductTax(productId, taxConfigId, companyId);
  const remaining = await store.getProductTaxes(productId, companyId);
  const rate = remaining.reduce(
    (sum, item) => sum + Number(item.customRate ?? item.taxConfig?.defaultRate ?? 0),
    0
  );
  const { Product } = require('../products/model'); // eslint-disable-line global-require
  await Product.updateOne(
    { _id: productId, company: companyId },
    { $set: { taxRate: rate, taxExempt: rate <= 0, updated: true, updatedAt: new Date() } }
  );
  return result;
}


function calculateProductTaxes(productId, basePrice, companyId) {
  if (!productId || basePrice === undefined || !companyId) {
    return Promise.reject(new Error('Product ID, base price, and company ID are required'));
  }

  if (basePrice < 0) {
    return Promise.reject(new Error('Base price cannot be negative'));
  }

  return store.calculateProductTaxes(productId, basePrice, companyId);
}

function calculateSaleTaxes(products, companyId) {
  if (!products || !Array.isArray(products) || products.length === 0) {
    return Promise.reject(new Error('Products array is required and cannot be empty'));
  }

  if (!companyId) {
    return Promise.reject(new Error('Company ID is required'));
  }

  const salesController = require('../sales/controller'); // eslint-disable-line global-require
  return salesController.calculateSaleTaxes(products, companyId);
}

async function getProductWithTaxes(productId, companyId) {
  if (!productId || !companyId) {
    return Promise.reject(new Error('Product ID and company ID are required'));
  }

  try {

    const {Product} = require('../products/model'); // eslint-disable-line global-require
    const product = await Product.findById(productId);
    
    if (!product) {
      return Promise.reject(new Error('Product not found'));
    }

    const taxCalculation = await calculateProductTaxes(productId, product.price, companyId);
    
    return {
      ...product.toObject(),
      taxInfo: taxCalculation
    };
  } catch (error) {
    return Promise.reject(new Error(`Error getting product with taxes: ${error.message}`));
  }
}

async function bulkSetProductTaxes(productIds, taxConfigId, customRate, companyId, userId) {
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return Promise.reject(new Error('Product IDs array is required and cannot be empty'));
  }

  if (!taxConfigId || customRate === undefined || !companyId) {
    return Promise.reject(new Error('Tax config ID, custom rate, and company ID are required'));
  }

  try {

    const promises = productIds.map(productId => 
      setProductTax(productId, taxConfigId, customRate, companyId, userId)
    );
    
    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    return Promise.reject(new Error(`Error in bulk set product taxes: ${error.message}`));
  }
}

module.exports = {
  addTaxConfig,
  listTaxConfigs,
  getTaxConfig,
  updateTaxConfig,
  removeTaxConfig,
  setProductTax,
  getProductTaxes,
  removeProductTax,
  bulkSetProductTaxes,
  calculateProductTaxes,
  calculateSaleTaxes,
  getProductWithTaxes
};
