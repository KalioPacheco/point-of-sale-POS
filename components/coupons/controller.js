const mongoose = require('mongoose');
const store = require('./store');
const Model = require('./model');

function isValidSaleObjectId(saleId) {
  if (saleId == null || saleId === '') return false;
  try {
    const oid = new mongoose.Types.ObjectId(saleId);
    const asStr = typeof saleId === 'string' ? saleId : saleId.toString();
    return oid.toString() === asStr.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Mapea snapshots de venta al formato esperado por calculateDiscount (price × quantity por ítem).
 */
function mapSaleProductsForCouponDiscount(productSnapshots) {
  if (!productSnapshots || !productSnapshots.length) return [];
  return productSnapshots.map((p) => ({
    productId: p.productId,
    quantity: p.quantity || 1,
    price: p.priceSnapshot ? p.priceSnapshot.price : p.price
  }));
}

/**
 * Registra el uso del cupón en BD solo cuando la venta ya existe (saleId real).
 * Idempotente: si usageHistory ya incluye este saleId, no duplica.
 */
async function recordCouponUsageForCompletedSale({
  couponId,
  couponCode,
  companyId,
  saleId,
  subtotal,
  total,
  products,
  customerId = null,
  customerPhone,
  customerEmail
}) {
  try {
    if (!couponId || !couponCode || !companyId || !saleId) {
      throw new Error('Datos incompletos para registrar uso del cupón');
    }
    if (!isValidSaleObjectId(saleId)) {
      throw new Error('saleId debe ser un ObjectId de venta persistida');
    }

    const coupon = await Model.findById(couponId);
    if (!coupon || String(coupon.company) !== String(companyId)) {
      throw new Error('Cupón no encontrado');
    }
    if (coupon.code.toUpperCase() !== String(couponCode).toUpperCase()) {
      throw new Error('El cupón no coincide con la venta');
    }

    const saleIdStr = String(saleId);
    const alreadyRecorded = coupon.usageHistory.some(
      (u) => u.saleId && String(u.saleId) === saleIdStr
    );
    if (alreadyRecorded) {
      return { recorded: false, skipped: true };
    }

    const saleData = {
      saleId,
      subtotal,
      total,
      products,
      customerPhone,
      customerEmail
    };

    const validation = coupon.isValidForSale(saleData, customerId);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    await coupon.recordUsage(saleData, customerId);
    return { recorded: true };
  } catch (error) {
    return Promise.reject(new Error(`Error registrando uso del cupón: ${error.message}`));
  }
}


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


async function validateCoupon(couponCode, companyId, saleData, customerId = null, session = null) {
  try {
    if (!couponCode || !companyId || !saleData) {
      return {
        valid: false,
        error: 'Faltan datos requeridos para validar el cupón'
      };
    }
    
    const coupon = await Model.findValidCoupon(couponCode, companyId, session);
    
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
    const Sale = require('../sales/model'); // eslint-disable-line global-require

    if (!saleData?.saleId || !mongoose.Types.ObjectId.isValid(saleData.saleId)) {
      return { success: false, error: 'A confirmed sale ID is required to consume a coupon' };
    }

    const sale = await Sale.findOne({
      _id: saleData.saleId,
      company: companyId,
      status: 'confirmed',
      disable: false
    });
    if (!sale) return { success: false, error: 'Confirmed sale not found' };

    const validation = await validateCoupon(couponCode, companyId, saleData, customerId);
    
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    if (!saleData || !isValidSaleObjectId(saleData.saleId)) {
      return {
        success: false,
        error: 'Se requiere saleId (ObjectId) de una venta ya persistida para registrar el uso del cupón'
      };
    }

    const coupon = await Model.findById(validation.coupon.id);
    
    if (!coupon) {
      return {
        success: false,
        error: 'Cupón no encontrado'
      };
    }
    const alreadyUsed = coupon.usageHistory.some(
      usage => usage.saleId && String(usage.saleId) === String(sale._id)
    );
    if (!alreadyUsed) {
      await coupon.recordUsage({
        ...saleData,
        saleId: sale._id,
        subtotal: sale.subtotal,
        total: sale.total,
        finalTotal: sale.finalTotal
      }, customerId);
    }

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


async function expireCoupons(companyId) {
  try {
    return await store.expireOldCoupons(companyId);
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
  recordCouponUsageForCompletedSale,
  mapSaleProductsForCouponDiscount,
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
