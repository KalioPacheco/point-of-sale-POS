const store = require('./store');


function addProduct(product) {
  if (!product) {
    return Promise.reject(
      `Products data is empty. Product: ${product.toString()}`,
    );
  }

  return store.add(product);
}

function listProducts(userId, companyId, filters = {}) {
  return store.list(userId, companyId, filters);
}

function updateProduct(productId, product, companyId = null) {
  if (!productId || !product) {
    return Promise.reject(
      `productId or product is undefined. productId is: ${productId}, product is: ${JSON.stringify(
        product,
      )}`,
    );
  }
  return store.update(productId, product, companyId);
}

function removeProduct(productId, companyId = null) {
  if (!productId) {
    return Promise.reject('productId is undefined');
  }
  return store.remove(productId, companyId);
}

function addStock(productId, quantity, userId, reason, companyId = null) {
  if (!productId || !quantity || quantity <= 0) {
    return Promise.reject('productId and positive quantity are required');
  }
  
  return store.addStock(productId, quantity, userId, reason, companyId);
}

function reduceStock(productId, quantity, userId, reason, companyId = null) {
  if (!productId || !quantity || quantity <= 0) {
    return Promise.reject('productId and positive quantity are required');
  }
  
  return store.reduceStock(productId, quantity, userId, reason, companyId);
}

function setStock(productId, quantity, reason, companyId = null) {
  if (!productId || quantity < 0) {
    return Promise.reject('productId and non-negative quantity are required');
  }
  
  return store.setStock(productId, quantity, null, reason, companyId);
}

function getStockHistory(productId, companyId = null) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  return store.getStockHistory(productId, companyId);
}

function getLowStockProducts(companyId, minStock = 5) {
  return store.getLowStockProducts(companyId, minStock);
}

function getProductStock(productId, companyId = null) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  return store.getProductStock(productId, companyId);
}


function addVariant(productId, variantData, companyId = null) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  if (!variantData || !variantData.name) {
    return Promise.reject('Variant data with name is required');
  }
  
  return store.addVariant(productId, variantData, companyId);
}

function addVariantStock(productId, variantId, quantity, reason, companyId = null) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  if (!variantId) {
    return Promise.reject('variantId is required');
  }
  
  if (!quantity || quantity <= 0) {
    return Promise.reject('positive quantity is required');
  }
  
  return store.addVariantStock(productId, variantId, quantity, reason, companyId);
}

function disableVariant(productId, variantId, reason, companyId = null) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  if (!variantId) {
    return Promise.reject('variantId is required');
  }
  
  return store.disableVariant(productId, variantId, reason, companyId);
}

function enableVariant(productId, variantId, reason, companyId = null) {
  if (!productId) {
    return Promise.reject('productId is required');
  }
  
  if (!variantId) {
    return Promise.reject('variantId is required');
  }
  
  return store.enableVariant(productId, variantId, reason, companyId);
}


async function checkCouponEligibility(productIds, couponId, companyId) {
  try {
    if (!productIds || !Array.isArray(productIds)) {
      return Promise.reject(new Error('Product IDs array is required'));
    }
    
    const Coupon = require('../coupons/model'); // eslint-disable-line global-require
    const coupon = await Coupon.findOne({ _id: couponId, company: companyId, disable: false });
    
    if (!coupon) {
      return Promise.reject(new Error('Coupon not found'));
    }
    
    const companyProducts = await store.list(null, companyId, { ids: productIds, disable: false });
    const companyProductIds = new Set(companyProducts.map(product => String(product._id)));
    const scopedProductIds = productIds.filter(productId => companyProductIds.has(String(productId)));

    if (coupon.applyToAllProducts) {
      return {
        eligible: scopedProductIds.length > 0,
        eligibleProducts: scopedProductIds,
        ineligibleProducts: productIds.filter(productId => !companyProductIds.has(String(productId)))
      };
    }
    
    
    const eligibleProducts = [];
    const ineligibleProducts = [];
    
    productIds.forEach(productId => {
      const isEligible = coupon.applicableProducts.some(
        id => id.toString() === productId.toString()
      ) && companyProductIds.has(String(productId));
      
      if (isEligible) {
        eligibleProducts.push(productId);
      } else {
        ineligibleProducts.push(productId);
      }
    });
    
    return {
      eligible: eligibleProducts.length > 0,
      eligibleProducts,
      ineligibleProducts
    };
    
  } catch (error) {
    return Promise.reject(new Error(`Error checking coupon eligibility: ${error.message}`));
  }
}

async function getProductsEligibleForCoupons(companyId, productIds = null) {
  try {
    const query = { 
      company: companyId,
      disable: false 
    };
    
    if (productIds && Array.isArray(productIds)) {
      query.id = { $in: productIds };
    }
    
    const products = await store.list(null, companyId, query);
    
    return products.map(product => ({
      id: product.id,
      name: product.name,
      price: product.price,
      taxRate: product.taxRate || 0,
      taxExempt: product.taxExempt || false,
      categories: product.categories,
      eligible: true 
    }));
    
  } catch (error) {
    return Promise.reject(new Error(`Error getting eligible products: ${error.message}`));
  }
}

async function calculateProductPriceWithCoupon(productId, couponCode, companyId, quantity = 1) {
  try {
    const product = await store.get(productId, companyId);
    if (!product) {
      return Promise.reject(new Error('Product not found'));
    }
    
    const Coupon = require('../coupons/model'); // eslint-disable-line global-require
    const coupon = await Coupon.findValidCoupon(couponCode, companyId);
    
    if (!coupon) {
      return {
        productId,
        originalPrice: product.price,
        finalPrice: product.price,
        discount: 0,
        couponApplied: false
      };
    }
    
    
    const isEligible = coupon.applyToAllProducts || 
      coupon.applicableProducts.some(id => id.toString() === productId.toString());
    
    if (!isEligible) {
      return {
        productId,
        originalPrice: product.price,
        finalPrice: product.price,
        discount: 0,
        couponApplied: false,
        reason: 'Product not eligible for this coupon'
      };
    }
    
    const basePrice = product.price * quantity;
    let discount = 0;
    
    if (coupon.discountType === 'percentage') {
      discount = (basePrice * coupon.discountValue) / 100;
    } else if (coupon.discountType === 'fixed_amount') {
      discount = Math.min(coupon.discountValue, basePrice);
    }
    
    const finalPrice = Math.max(0, basePrice - discount);
    
    return {
      productId,
      originalPrice: basePrice,
      finalPrice,
      discount,
      discountPerUnit: discount / quantity,
      couponApplied: true,
      couponCode: coupon.code,
      couponName: coupon.name
    };
    
  } catch (error) {
    return Promise.reject(new Error(`Error calculating product price with coupon: ${error.message}`));
  }
}

async function getProductsByCategories(categoryIds, companyId) {
  try {
    if (!categoryIds || !Array.isArray(categoryIds)) {
      return [];
    }
    
    const products = await store.list(null, companyId, {
      categories: { $in: categoryIds },
      disable: false
    });
    
    return products.map(product => ({
      id: product.id,
      name: product.name,
      price: product.price,
      categories: product.categories,
      taxRate: product.taxRate || 0,
      taxExempt: product.taxExempt || false
    }));
    
  } catch (error) {
    return Promise.reject(new Error(`Error getting products by categories: ${error.message}`));
  }
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
  checkCouponEligibility,
  getProductsEligibleForCoupons,
  calculateProductPriceWithCoupon,
  getProductsByCategories
};
