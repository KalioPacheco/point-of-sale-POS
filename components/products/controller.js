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


function addStock(productId, quantity, reason) {
  if (!productId || !quantity || quantity <= 0) {
    return Promise.reject('productId and positive quantity are required');
  }
  
  return store.addStock(productId, quantity, reason);
}

function reduceStock(productId, quantity, reason) {
  if (!productId || !quantity || quantity <= 0) {
    return Promise.reject('productId and positive quantity are required');
  }
  
  return store.reduceStock(productId, quantity, reason);
}

function setStock(productId, quantity, reason) {
  if (!productId || quantity < 0) {
    return Promise.reject('productId and non-negative quantity are required');
  }
  
  return store.setStock(productId, quantity, reason);
}

function getStockHistory(productId) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  return store.getStockHistory(productId);
}

function getLowStockProducts(companyId, minStock = 5) {
  return store.getLowStockProducts(companyId, minStock);
}

function getProductStock(productId) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  return store.getProductStock(productId);
}
// variantes agregadas 
function addVariant(productId, variantData) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  if (!variantData || !variantData.name) {
    return Promise.reject('Variant data with name is required');
  }
  
  return store.addVariant(productId, variantData);
}

function addVariantStock(productId, variantId, quantity, reason) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  if (!variantId) {
    return Promise.reject('variantId is required');
  }
  
  if (!quantity || quantity <= 0) {
    return Promise.reject('positive quantity is required');
  }
  
  return store.addVariantStock(productId, variantId, quantity, reason);
}

function disableVariant(productId, variantId, reason) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  if (!variantId) {
    return Promise.reject('variantId is required');
  }
  
  return store.disableVariant(productId, variantId, reason);
}

function enableVariant(productId, variantId, reason) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  if (!variantId) {
    return Promise.reject('variantId is required');
  }
  
  return store.enableVariant(productId, variantId, reason);
}

module.exports = {
  addProduct,
  listProducts,
  updateProduct,
  removeProduct,
  addStock,
  reduceStock,
  setStock,
  getStockHistory,
  getLowStockProducts,
  getProductStock,
  addVariant,
  addVariantStock,
  disableVariant,
  enableVariant,
};