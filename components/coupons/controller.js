const store = require('./store');
const Model = require('./model');


function addCoupon(couponData) {
  if (!couponData) {
    return Promise.reject(new Error('Coupon data is empty'));
  }

  const updatedCouponData = { ...couponData };
  
  if (!updatedCouponData.code) {
    updatedCouponData.code = Model.generateCode();
  }

  return store.add(updatedCouponData);
}

function listCoupons(couponId, companyId, filters = {}) {
  return store.list(couponId, companyId, filters);
}

function updateCoupon(couponId, couponData) {
  if (!couponId || !couponData) {
    return Promise.reject(new Error(
      `couponId or coupon data is undefined. couponId: ${couponId}`
    ));
  }
  return store.update(couponId, couponData);
}

function removeCoupon(couponId) {
  if (!couponId) {
    return Promise.reject(new Error('couponId is undefined'));
  }
  return store.remove(couponId);
}


async function validateCoupon(couponCode, companyId, saleData, customerId = null) {
  try {
    if (!couponCode || !companyId || !saleData) {
      return {
        valid: false,
        error: 'Faltan datos requeridos para validar el cupón'
      };
    }
    
    const coupon = await Model.findValidCoupon(couponCode, companyId);
    
    if (!coupon) {
      return {
        valid: false,
        error: 'Cupón no encontrado o no válido'
      };
    }
    const validation = coupon.isValidForSale(saleData, customerId);
    
    if (!validation.valid) {
      return {
        valid: false,
        error: validation.errors.join(', ')
      };
    }

    const discountCalculation = coupon.calculateDiscount(saleData);
    
    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue
      },
      discount: discountCalculation
    };

  } catch (error) {
    return Promise.reject(new Error(`Error validating coupon: ${error.message}`));
  }
}

async function applyCoupon(couponCode, companyId, saleData, customerId = null) {
  try {

    const validation = await validateCoupon(couponCode, companyId, saleData, customerId);
    
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    const coupon = await Model.findById(validation.coupon.id);
    
    if (!coupon) {
      return {
        success: false,
        error: 'Cupón no encontrado'
      };
    }
    await coupon.recordUsage(saleData, customerId);

    return {
      success: true,
      coupon: validation.coupon,
      discount: validation.discount,
      message: `Cupón aplicado: $${validation.discount.discountAmount} de descuento`
    };

  } catch (error) {
    return Promise.reject(new Error(`Error applying coupon: ${error.message}`));
  }
}


async function searchCoupons(companyId, searchTerm, filters = {}) {
  try {
    const searchFilters = {
      ...filters,
      $or: [
        { code: searchTerm },
        { name: searchTerm }
      ]
    };

    return await store.list(null, companyId, searchFilters);

  } catch (error) {
    return Promise.reject(new Error(`Error searching coupons: ${error.message}`));
  }
}

async function getActiveCoupons(companyId) {
  try {
    return await store.getActiveCoupons(companyId);
  } catch (error) {
    return Promise.reject(new Error(`Error getting active coupons: ${error.message}`));
  }
}

async function getCouponsForCashier(companyId) {
  try {
    return await store.getCouponsForCashier(companyId);
  } catch (error) {
    return Promise.reject(new Error(`Error getting coupons for cashier: ${error.message}`));
  }
}

async function getCouponStats(couponId) {
  try {
    return await store.getCouponStats(couponId);
  } catch (error) {
    return Promise.reject(new Error(`Error getting coupon stats: ${error.message}`));
  }
}

async function getCouponsReport(companyId, startDate, endDate) {
  try {
    return await store.getCouponsReport(companyId, startDate, endDate);
  } catch (error) {
    return Promise.reject(new Error(`Error generating coupons report: ${error.message}`));
  }
}


async function expireCoupons() {
  try {
    return await store.expireOldCoupons();
  } catch (error) {
    return Promise.reject(new Error(`Error expiring coupons: ${error.message}`));
  }
}

function generateCouponCode(prefix = 'COUP') {
  return Model.generateCode(prefix);
}


async function calculateSaleWithCoupon(saleData, couponCode, companyId, customerId = null) {
  try {
    if (!couponCode) {
      return {
        success: true,
        saleData,
        message: 'No se aplicó ningún cupón'
      };
    }

    const couponResult = await validateCoupon(couponCode, companyId, saleData, customerId);
    
    if (!couponResult.valid) {
      return {
        success: false,
        error: couponResult.error,
        saleData
      };
    }

    // eslint-disable-next-line prefer-destructuring
    const discountAmount = couponResult.discount.discountAmount;
    
    const newSaleData = {
      ...saleData,
      discount: discountAmount,
      subtotalWithDiscount: saleData.subtotal - discountAmount,
      total: saleData.total - discountAmount,
      appliedCoupon: {
        code: couponResult.coupon.code,
        name: couponResult.coupon.name,
        discountAmount
      }
    };

    return {
      success: true,
      saleData: newSaleData,
      coupon: couponResult.coupon,
      discount: couponResult.discount,
      message: `Cupón ${couponResult.coupon.code} aplicado correctamente`
    };

  } catch (error) {
    return Promise.reject(new Error(`Error calculating sale with coupon: ${error.message}`));
  }
}

async function getCustomerCouponHistory(customerId, companyId) {
  try {
    return await store.getCustomerCouponHistory(customerId, companyId);
  } catch (error) {
    return Promise.reject(new Error(`Error getting customer coupon history: ${error.message}`));
  }
}

async function checkCouponCode(code, companyId, excludeId = null) {
  try {
    return await store.checkCodeUniqueness(code, companyId, excludeId);
  } catch (error) {
    return Promise.reject(new Error(`Error checking coupon code: ${error.message}`));
  }
}

module.exports = {
  addCoupon,
  listCoupons,
  updateCoupon,
  removeCoupon,
  validateCoupon,
  applyCoupon,
  searchCoupons,
  getActiveCoupons,
  getCouponsForCashier,
  getCouponStats,
  getCouponsReport,
  expireCoupons,
  generateCouponCode,
  calculateSaleWithCoupon,
  getCustomerCouponHistory,
  checkCouponCode
};