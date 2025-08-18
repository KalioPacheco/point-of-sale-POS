const Model = require('./model');



async function add(couponData) {
  try {
    const newCoupon = new Model(couponData);
    const savedCoupon = await newCoupon.save();
    return savedCoupon;
  } catch (error) {
    throw new Error(`Error creating coupon: ${error.message}`);
  }
}

async function get(id) {
  try {
    const coupon = await Model.findById(id)
      .populate('applicableProducts', 'name price')
      .populate('company', 'name')
      .populate('createdBy', 'name email');
    
    return coupon;
  } catch (error) {
    throw new Error(`Error getting coupon: ${error.message}`);
  }
}

async function list(couponId, companyId, filters = {}) {
  try {
    const query = {};

    if (couponId) {
      return await get(couponId);
    }

    if (companyId) {
      query.company = companyId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.discountType) {
      query.discountType = filters.discountType;
    }

    if (filters.active !== undefined) {
      query.disable = !filters.active;
    }

    if (filters.expired !== undefined) {
      const now = new Date();
      if (filters.expired) {
        query.expirationDate = { $lt: now };
      } else {
        query.expirationDate = { $gte: now };
      }
    }

    if (filters.code) {
      query.code = { $regex: filters.code, $options: 'i' };
    }

    if (filters.name) {
      query.name = { $regex: filters.name, $options: 'i' };
    }

    const coupons = await Model.find(query)
      .populate('applicableProducts', 'name price')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(filters.limit || 100);

    return coupons;

  } catch (error) {
    throw new Error(`Error listing coupons: ${error.message}`);
  }
}

async function update(id, couponData) {
  try {
    const existingCoupon = await Model.findById(id);
    
    if (!existingCoupon) {
      throw new Error('Coupon not found');
    }

    if (existingCoupon.usageHistory.length > 0) {
      const restrictedFields = ['code', 'discountType', 'discountValue', 'applicableProducts'];
      const hasRestrictedChanges = restrictedFields.some(field => 
        couponData[field] !== undefined
      );

      if (hasRestrictedChanges) {
        throw new Error('No se pueden modificar campos críticos en cupones que ya han sido utilizados');
      }
    }

    const updatedCouponData = { ...couponData, updatedAt: new Date() };
    
    const updatedCoupon = await Model.findByIdAndUpdate(
      id,
      updatedCouponData,
      { new: true, runValidators: true }
    )
      .populate('applicableProducts', 'name price')
      .populate('createdBy', 'name email');

    return updatedCoupon;

  } catch (error) {
    throw new Error(`Error updating coupon: ${error.message}`);
  }
}

async function remove(id) {
  try {
    const coupon = await Model.findById(id);
    
    if (!coupon) {
      throw new Error('Coupon not found');
    }
    if (coupon.usageHistory.length > 0) {
      coupon.disable = true;
      coupon.status = 'inactive';
      coupon.updatedAt = new Date();
      return await coupon.save();
    }

 
    return await Model.findByIdAndDelete(id);

  } catch (error) {
    throw new Error(`Error removing coupon: ${error.message}`);
  }
}

async function findByCode(code, companyId) {
  try {
    const coupon = await Model.findOne({
      code: code.toUpperCase(),
      company: companyId,
      disable: false
    })
      .populate('applicableProducts', 'name price');

    return coupon;

  } catch (error) {
    throw new Error(`Error finding coupon by code: ${error.message}`);
  }
}

async function getActiveCoupons(companyId) {
  try {
    const now = new Date();
    
    const coupons = await Model.find({
      company: companyId,
      disable: false,
      status: 'active',
      expirationDate: { $gte: now }
    })
      .select('code name description discountType discountValue minimumPurchase applicationMethods')
      .sort({ name: 1 });

    return coupons;

  } catch (error) {
    throw new Error(`Error getting active coupons: ${error.message}`);
  }
}

async function getCouponsForCashier(companyId) {
  try {
    const now = new Date();
    
    const coupons = await Model.find({
      company: companyId,
      disable: false,
      status: 'active',
      expirationDate: { $gte: now },
      'applicationMethods.cashierSelection': true
    })
      .select('code name description discountType discountValue minimumPurchase')
      .sort({ name: 1 });

    return coupons;

  } catch (error) {
    throw new Error(`Error getting coupons for cashier: ${error.message}`);
  }
}

async function getCustomerCouponHistory(customerId, companyId) {
  try {
    const coupons = await Model.find({
      company: companyId,
      'usageHistory.customerId': customerId
    })
      .select('code name discountType discountValue usageHistory')
      .sort({ 'usageHistory.usedAt': -1 });

    const history = [];
    coupons.forEach(coupon => {
      const customerUsages = coupon.usageHistory.filter(
        usage => usage.customerId && usage.customerId.toString() === customerId.toString()
      );
      
      customerUsages.forEach(usage => {
        history.push({
          couponCode: coupon.code,
          couponName: coupon.name,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          discountApplied: usage.discountApplied,
          usedAt: usage.usedAt,
          saleId: usage.saleId
        });
      });
    });

    return history.sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));

  } catch (error) {
    throw new Error(`Error getting customer coupon history: ${error.message}`);
  }
}

async function getCouponStats(couponId) {
  try {
    const coupon = await Model.findById(couponId);

    if (!coupon) {
      throw new Error('Coupon not found');
    }

    const totalUsage = coupon.usageHistory.length;
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
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      averageDiscount: Math.round(averageDiscount * 100) / 100,
      uniqueCustomers,
      lastUsed,
      status: coupon.status,
      isExpired: new Date() > coupon.expirationDate
    };

  } catch (error) {
    throw new Error(`Error getting coupon stats: ${error.message}`);
  }
}

async function getCouponsReport(companyId, startDate, endDate) {
  try {
    const matchStage = {
      company: companyId,
      disable: false
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const report = await Model.aggregate([
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
          totalUsage: { $sum: { $size: '$usageHistory' } },
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
      totalUsage: 0,
      totalDiscountGiven: 0
    };

  } catch (error) {
    throw new Error(`Error generating coupons report: ${error.message}`);
  }
}

async function expireOldCoupons() {
  try {
    const now = new Date();

    const result = await Model.updateMany(
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
    throw new Error(`Error expiring coupons: ${error.message}`);
  }
}

async function checkCodeUniqueness(code, companyId, excludeId = null) {
  try {
    const query = {
      code: code.toUpperCase(),
      company: companyId,
      disable: false
    };

    if (excludeId) {
      query.id = { $ne: excludeId };
    }

    const existingCoupon = await Model.findOne(query);
    return !existingCoupon;

  } catch (error) {
    throw new Error(`Error checking code uniqueness: ${error.message}`);
  }
}

module.exports = {
  add,
  get,
  list,
  update,
  remove,
  findByCode,
  getActiveCoupons,
  getCouponsForCashier,
  getCustomerCouponHistory,
  getCouponStats,
  getCouponsReport,
  expireOldCoupons,
  checkCodeUniqueness
};