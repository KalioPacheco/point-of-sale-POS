const Model = require('./model');

async function addCoupon(coupon) {
  try {
    const newCoupon = new Model(coupon);
    const savedCoupon = await newCoupon.save();
    return savedCoupon;
  } catch (error) {
    throw new Error(`Error creating coupon: ${error.message}`);
  }
}

async function getCoupon(id) {
  try {
    const coupon = await Model.findById(id)
      .populate('applicableProducts', 'name price photo')
      .populate('applicableCategories', 'name')
      .populate('company', 'name')
      .populate('createdBy', 'name email');
    
    return coupon;
  } catch (error) {
    throw new Error(`Error getting coupon: ${error.message}`);
  }
}

async function list(couponId, companyId, filters = {}) {
  try {
    let query = {};

    if (couponId) {
      return await getCoupon(couponId);
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

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    if (filters.code) {
      query.code = { $regex: filters.code, $options: 'i' };
    }
  
    if (filters.name) {
      query.name = { $regex: filters.name, $options: 'i' };
    }

    const coupons = await Model.find(query)
      .populate('applicableProducts', 'name price photo')
      .populate('applicableCategories', 'name')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(filters.limit || 100);

    return coupons;

  } catch (error) {
    throw new Error(`Error listing coupons: ${error.message}`);
  }
}

async function updateCoupon(id, couponData) {
  try {
   
    const existingCoupon = await Model.findById(id);
    
    if (!existingCoupon) {
      throw new Error('Coupon not found');
    }

    if (existingCoupon.currentUsage > 0) {
      const restrictedFields = ['code', 'discountType', 'discountValue', 'applicableProducts'];
      const hasRestrictedChanges = restrictedFields.some(field => 
        couponData[field] !== undefined && 
        couponData[field] !== existingCoupon[field]
      );

      if (hasRestrictedChanges) {
        throw new Error('No se pueden modificar campos críticos en cupones que ya han sido utilizados');
      }
    }

    couponData.updatedAt = new Date();
    
    const updatedCoupon = await Model.findByIdAndUpdate(
      id,
      couponData,
      { new: true, runValidators: true }
    )
      .populate('applicableProducts', 'name price photo')
      .populate('applicableCategories', 'name')
      .populate('createdBy', 'name email');

    return updatedCoupon;

  } catch (error) {
    throw new Error(`Error updating coupon: ${error.message}`);
  }
}

async function removeCoupon(id) {
  try {
    const coupon = await Model.findById(id);
    
    if (!coupon) {
      throw new Error('Coupon not found');
    }

    if (coupon.currentUsage > 0) {
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
      .populate('applicableProducts', 'name price photo')
      .populate('applicableCategories', 'name');

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
      startDate: { $lte: now },
      expirationDate: { $gte: now },
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ['$currentUsage', '$usageLimit'] } }
      ]
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
      startDate: { $lte: now },
      expirationDate: { $gte: now },
      'applicationMethods.cashierSelection': true,
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ['$currentUsage', '$usageLimit'] } }
      ]
    })
      .select('code name description discountType discountValue minimumPurchase')
      .sort({ name: 1 });

    return coupons;

  } catch (error) {
    throw new Error(`Error getting coupons for cashier: ${error.message}`);
  }
}

async function getCustomerCoupons(customerId, companyId) {
  try {
    const now = new Date();
    
    const availableCoupons = await Model.find({
      company: companyId,
      disable: false,
      status: 'active',
      startDate: { $lte: now },
      expirationDate: { $gte: now },
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ['$currentUsage', '$usageLimit'] } }
      ]
    });
    const customerAvailableCoupons = availableCoupons.filter(coupon => {
      if (!coupon.usagePerCustomer) return true;
      
      const customerUsage = coupon.usageHistory.filter(
        usage => usage.customerId && usage.customerId.toString() === customerId.toString()
      ).length;
      
      return customerUsage < coupon.usagePerCustomer;
    });

    return customerAvailableCoupons.map(coupon => ({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minimumPurchase: coupon.minimumPurchase,
      expirationDate: coupon.expirationDate,
      remainingUses: coupon.usagePerCustomer ? 
        coupon.usagePerCustomer - coupon.usageHistory.filter(
          usage => usage.customerId && usage.customerId.toString() === customerId.toString()
        ).length : 'Ilimitado'
    }));

  } catch (error) {
    throw new Error(`Error getting customer coupons: ${error.message}`);
  }
}

async function getCouponUsageReport(companyId, startDate, endDate) {
  try {
    const matchStage = {
      company: companyId,
      disable: false
    };

    if (startDate || endDate) {
      matchStage['usageHistory.usedAt'] = {};
      if (startDate) matchStage['usageHistory.usedAt'].$gte = new Date(startDate);
      if (endDate) matchStage['usageHistory.usedAt'].$lte = new Date(endDate);
    }

    const report = await Model.aggregate([
      { $match: matchStage },
      { $unwind: '$usageHistory' },
      {
        $match: startDate || endDate ? {
          'usageHistory.usedAt': {
            ...(startDate && { $gte: new Date(startDate) }),
            ...(endDate && { $lte: new Date(endDate) })
          }
        } : {}
      },
      {
        $group: {
          _id: '$_id',
          code: { $first: '$code' },
          name: { $first: '$name' },
          discountType: { $first: '$discountType' },
          discountValue: { $first: '$discountValue' },
          totalUsage: { $sum: 1 },
          totalDiscount: { $sum: '$usageHistory.discountApplied' },
          averageDiscount: { $avg: '$usageHistory.discountApplied' },
          lastUsed: { $max: '$usageHistory.usedAt' }
        }
      },
      { $sort: { totalUsage: -1 } }
    ]);

    return report;

  } catch (error) {
    throw new Error(`Error generating coupon usage report: ${error.message}`);
  }
}

async function getTopCoupons(companyId, limit = 10) {
  try {
    const topCoupons = await Model.find({
      company: companyId,
      disable: false,
      currentUsage: { $gt: 0 }
    })
      .sort({ currentUsage: -1 })
      .limit(limit)
      .select('code name currentUsage usageHistory discountType discountValue');

    return topCoupons.map(coupon => ({
      code: coupon.code,
      name: coupon.name,
      totalUsage: coupon.currentUsage,
      totalDiscount: coupon.usageHistory.reduce(
        (sum, usage) => sum + usage.discountApplied, 0
      ),
      discountType: coupon.discountType,
      discountValue: coupon.discountValue
    }));

  } catch (error) {
    throw new Error(`Error getting top coupons: ${error.message}`);
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

    return result;

  } catch (error) {
    throw new Error(`Error expiring old coupons: ${error.message}`);
  }
}

async function cleanupOldUsage(daysToKeep = 365) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Model.updateMany(
      {},
      {
        $pull: {
          usageHistory: {
            usedAt: { $lt: cutoffDate }
          }
        }
      }
    );

    return result;

  } catch (error) {
    throw new Error(`Error cleaning up old usage: ${error.message}`);
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
      query._id = { $ne: excludeId };
    }

    const existingCoupon = await Model.findOne(query);
    return !existingCoupon;

  } catch (error) {
    throw new Error(`Error checking code uniqueness: ${error.message}`);
  }
}

async function bulkUpdateStatus(couponIds, newStatus) {
  try {
    const result = await Model.updateMany(
      { _id: { $in: couponIds } },
      { 
        status: newStatus,
        updatedAt: new Date()
      }
    );

    return result;

  } catch (error) {
    throw new Error(`Error bulk updating status: ${error.message}`);
  }
}

async function bulkDelete(couponIds) {
  try {
  
    const usedCoupons = await Model.find({
      _id: { $in: couponIds },
      currentUsage: { $gt: 0 }
    }).select('code');

    if (usedCoupons.length > 0) {
      const codes = usedCoupons.map(c => c.code).join(', ');
      throw new Error(`No se pueden eliminar cupones que ya han sido usados: ${codes}`);
    }

    const result = await Model.deleteMany({
      _id: { $in: couponIds },
      currentUsage: 0
    });

    return result;

  } catch (error) {
    throw new Error(`Error bulk deleting coupons: ${error.message}`);
  }
}

module.exports = {
  add: addCoupon,
  get: getCoupon,
  list,
  update: updateCoupon,
  remove: removeCoupon,
  findByCode,
  getActiveCoupons,
  getCouponsForCashier,
  getCustomerCoupons,
  getCouponUsageReport,
  getTopCoupons,
  expireOldCoupons,
  cleanupOldUsage,
  checkCodeUniqueness,
  bulkUpdateStatus,
  bulkDelete
};