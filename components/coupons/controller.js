const store = require('./store');

function addCoupon(couponData) {
  if (!couponData) {
    return Promise.reject(new Error('Coupon data is empty'));
  }

  // Generar código si no se proporciona
  if (!couponData.code) {
    const Coupon = require('./model');
    couponData.code = Coupon.generateCode();
  }

  return store.add(couponData);
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

    const Coupon = require('./model');
    
    // Buscar el cupón
    const coupon = await Coupon.findValidCoupon(couponCode, companyId);
    
    if (!coupon) {
      return {
        valid: false,
        error: 'Cupón no encontrado o no válido'
      };
    }

    // Verificar si es válido para esta venta
    const validation = coupon.isValidForSale(saleData, customerId);
    
    if (!validation.valid) {
      return {
        valid: false,
        error: validation.errors.join(', ')
      };
    }

    // Calcular el descuento
    const discountCalculation = coupon.calculateDiscount(saleData);
    
    return {
      valid: true,
      coupon: {
        _id: coupon._id,
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
    // Primero validar el cupón
    const validation = await validateCoupon(couponCode, companyId, saleData, customerId);
    
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    const Coupon = require('./model');
    const coupon = await Coupon.findById(validation.coupon._id);
    
    if (!coupon) {
      return {
        success: false,
        error: 'Cupón no encontrado'
      };
    }

    // Registrar el uso del cupón
    await coupon.recordUsage(saleData, customerId);

    return {
      success: true,
      coupon: validation.coupon,
      discount: validation.discount,
      message: `Cupón aplicado: ${validation.discount.discountAmount} de descuento`
    };

  } catch (error) {
    return Promise.reject(new Error(`Error applying coupon: ${error.message}`));
  }
}


async function searchCoupons(companyId, searchTerm, filters = {}) {
  try {
    const query = {
      company: companyId,
      disable: false,
      $or: [
        { code: { $regex: searchTerm, $options: 'i' } },
        { name: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    // Aplicar filtros adicionales
    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.discountType) {
      query.discountType = filters.discountType;
    }

    if (filters.active !== undefined) {
      query.status = filters.active ? 'active' : { $ne: 'active' };
    }

    const Coupon = require('./model');
    const coupons = await Coupon.find(query)
      .populate('applicableProducts', 'name price')
      .populate('applicableCategories', 'name')
      .sort({ createdAt: -1 });

    return coupons;

  } catch (error) {
    return Promise.reject(new Error(`Error searching coupons: ${error.message}`));
  }
}

async function getActiveCoupons(companyId) {
  try {
    const now = new Date();
    
    const Coupon = require('./model');
    const coupons = await Coupon.find({
      company: companyId,
      disable: false,
      status: 'active',
      startDate: { $lte: now },
      expirationDate: { $gte: now },
      'applicationMethods.cashierSelection': true
    })
    .select('code name description discountType discountValue minimumPurchase')
    .sort({ name: 1 });

    return coupons;

  } catch (error) {
    return Promise.reject(new Error(`Error getting active coupons: ${error.message}`));
  }
}


async function getCouponStats(couponId) {
  try {
    const Coupon = require('./model');
    const coupon = await Coupon.findById(couponId);

    if (!coupon) {
      return Promise.reject(new Error('Coupon not found'));
    }

    const totalUsage = coupon.currentUsage;
    const totalDiscount = coupon.usageHistory.reduce(
      (sum, usage) => sum + usage.discountApplied, 0
    );

    const uniqueCustomers = new Set(
      coupon.usageHistory
        .filter(usage => usage.customerId)
        .map(usage => usage.customerId.toString())
    ).size;

    const averageDiscount = totalUsage > 0 ? totalDiscount / totalUsage : 0;

    const lastUsed = coupon.usageHistory.length > 0
      ? coupon.usageHistory[coupon.usageHistory.length - 1].usedAt
      : null;

    return {
      totalUsage,
      remainingUsage: coupon.usageLimit ? coupon.usageLimit - totalUsage : 'Ilimitado',
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      averageDiscount: Math.round(averageDiscount * 100) / 100,
      uniqueCustomers,
      lastUsed,
      status: coupon.status,
      isExpired: new Date() > coupon.expirationDate
    };

  } catch (error) {
    return Promise.reject(new Error(`Error getting coupon stats: ${error.message}`));
  }
}

async function getCouponsReport(companyId, startDate, endDate) {
  try {
    const Coupon = require('./model');
    
    const matchStage = {
      company: companyId,
      disable: false
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const report = await Coupon.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCoupons: { $sum: 1 },
          activeCoupons: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          expiredCoupons: {
            $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
          },
          depletedCoupons: {
            $sum: { $cond: [{ $eq: ['$status', 'depleted'] }, 1, 0] }
          },
          totalUsage: { $sum: '$currentUsage' },
          totalDiscountGiven: {
            $sum: {
              $reduce: {
                input: '$usageHistory',
                initialValue: 0,
                in: { $add: ['$$value', '$$this.discountApplied'] }
              }
            }
          }
        }
      }
    ]);

    return report[0] || {
      totalCoupons: 0,
      activeCoupons: 0,
      expiredCoupons: 0,
      depletedCoupons: 0,
      totalUsage: 0,
      totalDiscountGiven: 0
    };

  } catch (error) {
    return Promise.reject(new Error(`Error generating coupons report: ${error.message}`));
  }
}

async function expireCoupons() {
  try {
    const Coupon = require('./model');
    const now = new Date();

    const result = await Coupon.updateMany(
      {
        status: 'active',
        expirationDate: { $lt: now }
      },
      {
        status: 'expired',
        updatedAt: now
      }
    );

    return {
      expired: result.modifiedCount
    };

  } catch (error) {
    return Promise.reject(new Error(`Error expiring coupons: ${error.message}`));
  }
}

function generateCouponCode(prefix = 'COUP') {
  const Coupon = require('./model');
  return Coupon.generateCode(prefix);
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

    // Calcular nueva venta con descuento
    const discountAmount = couponResult.discount.discountAmount;
    
    const newSaleData = {
      ...saleData,
      discount: discountAmount,
      subtotalWithDiscount: saleData.subtotal - discountAmount,
      // Recalcular total con descuento (después o antes de impuestos según configuración)
      total: couponResult.coupon.applyBeforeTax 
        ? (saleData.subtotal - discountAmount) + saleData.totalTaxes
        : saleData.total - discountAmount,
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


module.exports = {
  addCoupon,
  listCoupons,
  updateCoupon,
  removeCoupon,
  validateCoupon,
  applyCoupon,
  searchCoupons,
  getActiveCoupons,
  getCouponStats,
  getCouponsReport,
  expireCoupons,
  generateCouponCode,
  calculateSaleWithCoupon
};