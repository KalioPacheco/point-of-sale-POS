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

// nueva funciones agregadas
function addPiecesToProduct(productId, piecesData) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  if (!piecesData || !piecesData.quantity || !piecesData.addedBy) {
  return Promise.reject('Pieces data is incomplete. Required: quantity, addedBy');
  }
  
  if (Number.isNaN(piecesData.quantity) || piecesData.quantity <= 0) {
  return Promise.reject('Quantity must be a positive number');
  }
  return store.addPieces(productId, piecesData);
}

function getStockHistory(productId) {
  if (!productId) {
  return Promise.reject('productId is required');
  }
return store.getStockHistory(productId);
}


// funcion pra las variantes (lo que podria srr colores,tallas,modelos entre otros )
function addVariant(productId, variantData) {
 
  if (!productId) {
    return Promise.reject('productId is required');
  }
  if (!variantData || !variantData.name) {
    return Promise.reject('Variant data is incomplete. Required: name');
  }
  return store.addVariant(productId, variantData);
}

function listVariants(productId) {
  
  if (!productId) {
    return Promise.reject('productId is required');
  }
  return store.listVariants(productId);
}

function updateVariant(productId, variantId, variantData) {
 
  if (!productId || !variantId) {
    return Promise.reject('productId and variantId are required');
  }
  return store.updateVariant(productId, variantId, variantData);
}

function removeVariant(productId, variantId) {
 
  if (!productId || !variantId) {
    return Promise.reject('productId and variantId are required');
  }
  return store.removeVariant(productId, variantId);
}

function addStockToVariant(productId, variantId, stockData) {
 
  if (!productId || !variantId) {
    return Promise.reject('productId and variantId are required');
  }
  if (!stockData || !stockData.quantity || !stockData.addedBy) {
    return Promise.reject('Stock data is incomplete. Required: quantity, addedBy');
  }
  return store.addStockToVariant(productId, variantId, stockData);
}

function getVariantStockHistory(productId, variantId) {

  if (!productId || !variantId) {
    return Promise.reject('productId and variantId are required');
  }
  return store.getVariantStockHistory(productId, variantId);
}

module.exports = {
  addProduct,
  listProducts,
  updateProduct,
  removeProduct,
  addPiecesToProduct, // nuevas funciones exportadas  
  getStockHistory,
  addVariant,           
  listVariants,         
  updateVariant,        
  removeVariant,       
  addStockToVariant,   
  getVariantStockHistory, 

};