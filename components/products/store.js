const mongoose = require('mongoose');
const Model = require('./model');

function addProduct(product) {
  const newProduct = new Model(product);
  return newProduct.save();
}

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function listProducts(productId, companyId, filters = {}) {
  const filter = {};
  
  if (productId) {
    filter._id = productId; // eslint-disable-line no-underscore-dangle
  }

  if (companyId && companyId !== 'default-company-id') {
    if (mongoose.Types.ObjectId.isValid(companyId)) {
      filter.company = companyId;
    }
  }
  
  if (typeof filters.disable === 'boolean') {
    filter.disable = filters.disable;
  } else {
    filter.disable = false;
  }

  if (filters.category && mongoose.Types.ObjectId.isValid(filters.category)) {
    filter.categories = filters.category;
  }

  if (filters.q && typeof filters.q === 'string' && filters.q.trim()) {
    const searchValue = filters.q.trim();
    const searchRegex = new RegExp(escapeRegex(searchValue), 'i');

    const queryOr = [
      { name: searchRegex },
      { code: searchRegex },
      { codigo: searchRegex },
    ];

    if (!Number.isNaN(Number(searchValue))) {
      queryOr.push({ folio: Number(searchValue) });
    }

    filter.$or = queryOr;
  }

  const products = await Model.find(filter)
    .populate('brand')
    .populate('company')
    .populate('createdBy')
    .populate('categories')
    .exec();
    
  return products;
}

async function updateProduct(productId, product) {
  const founProduct = await Model.findOne({
    // eslint-disable-next-line no-underscore-dangle
    _id: productId,
  });

  if (!founProduct) {
    throw new Error('Product not found');
  }

  const {
    name = '',
    photo = '',
    price = '',
    brand = '',
    description = '',
    stock = '',
    minSell = {},
    hasVariants = null,
    variants = null,
    categories = null
  } = product;

  if (categories) {
    founProduct.categories = categories;
  }
  if (name) {
    founProduct.name = name;
  }
  if (photo) {
    founProduct.photo = photo;
  }
  if (price !== undefined) {
    founProduct.price = price;
  }
  if (brand) {
    founProduct.brand = brand;
  }
  if (description) {
    founProduct.description = description;
  }
  if (stock !== '') {
    founProduct.stock = stock;
  }
  if (minSell) {
    founProduct.minSell = {
      ...founProduct.minSell,
      ...minSell,
    };
  }

  if (hasVariants !== null) {
    founProduct.hasVariants = hasVariants;
  }
  if (variants !== null) {
    founProduct.variants = variants;
  }

  founProduct.updated = true;
  founProduct.updatedAt = new Date();

  return founProduct.save();
}

async function removeProduct(productId) {
  const foundProduct = await Model.findOne({
    // eslint-disable-next-line no-underscore-dangle
    _id: productId,
  });

  if (!foundProduct) {
    throw new Error('Product not found');
  }

  foundProduct.disable = true;
  return foundProduct.save();
}

async function addStock(productId, quantity, reason = 'Manual adjustment') {
  console.log(`Adding stock: productId=${productId}, quantity=${quantity}, reason=${reason}`);
  
  const product = await Model.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const previousStock = product.stock || 0;
  const newStock = previousStock + quantity;
  product.stock = newStock;
  product.updated = true;
  product.updatedAt = new Date();
  
  const savedProduct = await product.save();
  
  console.log(`Stock successfully updated: ${product.name} - ${previousStock} → ${newStock} (+${quantity})`);

  return {
    success: true,
    product: {
      id: savedProduct._id, // eslint-disable-line no-underscore-dangle
      name: savedProduct.name,
      previousStock,
      newStock,
      quantityAdded: quantity,
      reason
    },
    message: `Successfully added ${quantity} units to ${product.name}. New stock: ${newStock}`
  };
}

async function reduceStock(productId, quantity, reason = 'Manual adjustment') {
  console.log(`Reducing stock: productId=${productId}, quantity=${quantity}, reason=${reason}`);
  
  const product = await Model.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const previousStock = product.stock || 0;

  if (previousStock < quantity) {
    throw new Error(`Insufficient stock. Available: ${previousStock}, Requested: ${quantity}`);
  }

  const newStock = previousStock - quantity;


  product.stock = newStock;
  product.updated = true;
  product.updatedAt = new Date();
  
  const savedProduct = await product.save();
  
  console.log(`Stock successfully updated: ${product.name} - ${previousStock} → ${newStock} (-${quantity})`);

  return {
    success: true,
    product: {
      id: savedProduct._id, // eslint-disable-line no-underscore-dangle
      name: savedProduct.name,
      previousStock,
      newStock,
      quantityReduced: quantity,
      reason
    },
    message: `Successfully reduced ${quantity} units from ${product.name}. New stock: ${newStock}`
  };
}

async function setStock(productId, quantity, reason = 'Stock adjustment') {
  console.log(`Setting stock: productId=${productId}, quantity=${quantity}, reason=${reason}`);
  
  const product = await Model.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const previousStock = product.stock || 0;
  const newStock = quantity;


  product.stock = newStock;
  product.updated = true;
  product.updatedAt = new Date();
  
  const savedProduct = await product.save();
  
  console.log(`Stock successfully set: ${product.name} - ${previousStock} → ${newStock}`);

  return {
    success: true,
    product: {
      id: savedProduct._id, // eslint-disable-line no-underscore-dangle
      name: savedProduct.name,
      previousStock,
      newStock,
      difference: newStock - previousStock,
      reason
    },
    message: `Successfully set stock to ${quantity} units for ${product.name}`
  };
}

async function getStockHistory(productId) {
  const product = await Model.findById(productId).select('name stock updatedAt');
  if (!product) {
    throw new Error('Product not found');
  }

  return {
    product: {
      id: product._id, // eslint-disable-line no-underscore-dangle
      name: product.name,
      currentStock: product.stock || 0,
      lastUpdated: product.updatedAt
    },
    message: 'Detailed stock history will be available in future version',
    note: 'Currently showing only current stock level'
  };
}

async function getLowStockProducts(companyId, minStock = 5) {
  const filter = {
    disable: false,
    $or: [
      { stock: { $lte: minStock } },
      { stock: { $exists: false } },
      { stock: null }
    ]
  };

  if (companyId && companyId !== 'default-company-id') {
    if (mongoose.Types.ObjectId.isValid(companyId)) {
      filter.company = companyId;
    }
  }

  const products = await Model.find(filter)
    .populate('brand', 'name')
    .populate('categories', 'name')
    .select('name stock price brand categories')
    .sort({ stock: 1 })
    .exec();

  return {
    products,
    count: products.length,
    criteria: `Products with stock ≤ ${minStock}`,
    message: products.length === 0 ? 'No products with low stock found' : `Found ${products.length} products with low stock`
  };
}

async function getProductStock(productId) {
  const product = await Model.findById(productId)
    .select('name stock price description hasVariants variants')
    .exec();

  if (!product) {
    throw new Error('Product not found');
  }

  let totalStock = 0;
  let variantDetails = [];

  if (product.hasVariants && product.variants.length > 0) {
    variantDetails = product.variants.map(variant => ({
      id: variant._id, // eslint-disable-line no-underscore-dangle
      name: variant.name,
      stock: variant.stock || 0,
      active: variant.active,
      attributes: variant.attributes
    }));
    
    totalStock = product.variants
      .filter(variant => variant.active)
      .reduce((total, variant) => total + (variant.stock || 0), 0);
  } else {
    totalStock = product.stock || 0;
  }

  return {
    id: product._id, // eslint-disable-line no-underscore-dangle
    name: product.name,
    price: product.price,
    description: product.description,
    hasVariants: product.hasVariants,
    stock: totalStock,
    variants: variantDetails,
    status: totalStock > 0 ? 'In Stock' : 'Out of Stock'
  };
}

async function addVariant(productId, variantData) {
  console.log(`Adding variant to product: ${productId}`, variantData);
  
  const product = await Model.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }


  const newVariant = {
    name: variantData.name,
    sku: variantData.sku,
    attributes: variantData.attributes || {},
    stock: variantData.stock || 0,
    price: variantData.price || null,
    active: variantData.active !== false, 
    photo: variantData.photo,
    createdAt: new Date()
  };

  product.variants.push(newVariant);
  product.hasVariants = true;
  product.updated = true;
  product.updatedAt = new Date();

  const savedProduct = await product.save();
  const addedVariant = savedProduct.variants[savedProduct.variants.length - 1];

  console.log(`Variant added successfully: ${addedVariant.name}`);

  return {
    success: true,
    product: {
      id: savedProduct._id, // eslint-disable-line no-underscore-dangle
      name: savedProduct.name,
      hasVariants: savedProduct.hasVariants
    },
    variant: {
      id: addedVariant._id, // eslint-disable-line no-underscore-dangle
      name: addedVariant.name,
      attributes: addedVariant.attributes,
      stock: addedVariant.stock,
      active: addedVariant.active
    },
    message: `Variant '${addedVariant.name}' added successfully to ${savedProduct.name}`
  };
}

async function addVariantStock(productId, variantId, quantity, reason = 'Manual adjustment') {
  console.log(`Adding stock to variant: productId=${productId}, variantId=${variantId}, quantity=${quantity}`);
  
  const product = await Model.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const variant = product.variants.id(variantId);
  if (!variant) {
    throw new Error('Variant not found');
  }

  if (!variant.active) {
    throw new Error('Cannot add stock to inactive variant');
  }

  const previousStock = variant.stock || 0;
  const newStock = previousStock + quantity;

  variant.stock = newStock;
  variant.updatedAt = new Date();
  product.updated = true;
  product.updatedAt = new Date();

  const savedProduct = await product.save();
  const updatedVariant = savedProduct.variants.id(variantId);

  console.log(`Variant stock updated: ${variant.name} - ${previousStock} → ${newStock} (+${quantity})`);

  return {
    success: true,
    product: {
      id: savedProduct._id, // eslint-disable-line no-underscore-dangle
      name: savedProduct.name
    },
    variant: {
      id: updatedVariant._id, // eslint-disable-line no-underscore-dangle
      name: updatedVariant.name,
      previousStock,
      newStock,
      quantityAdded: quantity,
      reason
    },
    message: `Successfully added ${quantity} units to variant '${updatedVariant.name}'. New stock: ${newStock}`
  };
}

async function disableVariant(productId, variantId, reason = 'Manual disable') {
  console.log(`Disabling variant: productId=${productId}, variantId=${variantId}`);
  
  const product = await Model.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const variant = product.variants.id(variantId);
  if (!variant) {
    throw new Error('Variant not found');
  }

  variant.active = false;
  variant.updatedAt = new Date();
  product.updated = true;
  product.updatedAt = new Date();

  const savedProduct = await product.save();
  const disabledVariant = savedProduct.variants.id(variantId);

  console.log(`Variant disabled: ${disabledVariant.name}`);

  return {
    success: true,
    product: {
      id: savedProduct._id, // eslint-disable-line no-underscore-dangle
      name: savedProduct.name
    },
    variant: {
      id: disabledVariant._id, // eslint-disable-line no-underscore-dangle
      name: disabledVariant.name,
      active: disabledVariant.active,
      reason
    },
    message: `Variant '${disabledVariant.name}' has been disabled`
  };
}

async function enableVariant(productId, variantId, reason = 'Manual enable') {
  console.log(`Enabling variant: productId=${productId}, variantId=${variantId}`);
  
  const product = await Model.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const variant = product.variants.id(variantId);
  if (!variant) {
    throw new Error('Variant not found');
  }

  variant.active = true;
  variant.updatedAt = new Date();
  product.updated = true;
  product.updatedAt = new Date();

  const savedProduct = await product.save();
  const enabledVariant = savedProduct.variants.id(variantId);

  console.log(`Variant enabled: ${enabledVariant.name}`);

  return {
    success: true,
    product: {
      id: savedProduct._id, // eslint-disable-line no-underscore-dangle
      name: savedProduct.name
    },
    variant: {
      id: enabledVariant._id, // eslint-disable-line no-underscore-dangle
      name: enabledVariant.name,
      active: enabledVariant.active,
      reason
    },
    message: `Variant '${enabledVariant.name}' has been enabled`
  };
}

module.exports = {
  add: addProduct,
  list: listProducts,
  update: updateProduct,
  remove: removeProduct,
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
