/* eslint-disable consistent-return */
const express = require('express');
const controller = require('./controller');
const response = require('../../network');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateCouponCreate, validateCouponUpdate } = require('../../middleware/validation');
const Coupon = require('./model');
const { requireCompanyScope, scopeResource, requireTenantParam } = require('../../middleware/tenant');

const router = express.Router();
const scopeCoupon = scopeResource(Coupon, 'id');
router.use(authenticateToken, requireCompanyScope);

router.post('/', validateCouponCreate, authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const couponData = {
      ...req.body,
      company: req.companyId,
      createdBy: req.user?._id || req.user?.id
    };

    const coupon = await controller.addCoupon(couponData);
    return response.success(req, res, coupon, 201);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});


router.get('/', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { status, discountType, active, expired, code, name, limit } = req.query;
    const companyId = req.companyId;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const filters = {
      status,
      discountType,
      active: active !== undefined ? active === 'true' : undefined,
      expired: expired !== undefined ? expired === 'true' : undefined,
      code,
      name,
      limit: limit ? parseInt(limit, 10) : undefined
    };


    Object.keys(filters).forEach(key => 
      filters[key] === undefined && delete filters[key]
    );

    const coupons = await controller.listCoupons(null, companyId, filters);
    return response.success(req, res, coupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


router.get('/:id', authenticateToken, requireRole(['admin', 'manager']), scopeCoupon, async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await controller.listCoupons(id, req.companyId);
    
    if (!coupon) {
      return response.error(req, res, 'Coupon not found', 404);
    }
    
    return response.success(req, res, coupon, 200);
  } catch (error) {
    response.error(req, res, error.message, 404);
  }
});


router.put('/:id', validateCouponUpdate, authenticateToken, requireRole(['admin', 'manager']), scopeCoupon, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedCoupon = await controller.updateCoupon(id, req.body);
    return response.success(req, res, updatedCoupon, 200);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});

router.delete('/:id', authenticateToken, requireRole(['admin', 'manager']), scopeCoupon, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await controller.removeCoupon(id);
    return response.success(req, res, result, 200);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});


router.post('/validate', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { 
      code, 
      saleData,
      customerId
    } = req.body;

    const companyId = req.companyId;
    
    if (!code || !companyId || !saleData) {
      return response.error(req, res, 'Código de cupón, empresa y datos de venta son requeridos', 400);
    }

    const validation = await controller.validateCoupon(
      code, 
      companyId, 
      saleData,
      customerId
    );

    if (validation.valid) {
      return response.success(req, res, validation, 200);
    }
    return response.error(req, res, validation.error, 400);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.post('/apply', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const {
      code,
      saleData,
      customerId
    } = req.body;

    const companyId = req.companyId;

    if (!code || !companyId || !saleData) {
      return response.error(req, res, 'Datos incompletos para aplicar cupón', 400);
    }

    const result = await controller.applyCoupon(
      code,
      companyId,
      saleData,
      customerId
    );

    if (result.success) {
      return response.success(req, res, result, 200);
    }
    return response.error(req, res, result.error, 400);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


router.get('/active/list', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const companyId = req.companyId;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const activeCoupons = await controller.getActiveCoupons(companyId);
    return response.success(req, res, activeCoupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/cashier/list', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const companyId = req.companyId;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const cashierCoupons = await controller.getCouponsForCashier(companyId);
    return response.success(req, res, cashierCoupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


router.get('/search/:term', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { term } = req.params;
    const companyId = req.companyId;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    if (term.length < 3) {
      return response.success(req, res, [], 200);
    }

    const coupons = await controller.searchCoupons(companyId, term);
    return response.success(req, res, coupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


router.post('/generate-code', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { prefix } = req.body;
    const code = controller.generateCouponCode(prefix);
    return response.success(req, res, { code }, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


router.get('/check-code/:code', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { code } = req.params;
    const companyId = req.companyId;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const available = await controller.checkCouponCode(code, companyId);
    
    return response.success(req, res, {
      available,
      exists: !available
    }, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/stats/:id', authenticateToken, requireRole(['admin', 'manager']), scopeCoupon, async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await controller.getCouponStats(id);
    return response.success(req, res, stats, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


router.get('/report/:companyId', authenticateToken, requireRole(['admin', 'manager']), requireTenantParam('companyId'), async (req, res) => {
  try {
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const report = await controller.getCouponsReport(companyId, startDate, endDate);
    return response.success(req, res, report, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/customer/history', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { customerId } = req.query;
    const companyId = req.companyId;
    
    if (!customerId || !companyId) {
      return response.error(req, res, 'Customer ID and Company ID are required', 400);
    }

    const history = await controller.getCustomerCouponHistory(customerId, companyId);
    return response.success(req, res, history, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


router.post('/maintenance/expire', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await controller.expireCoupons(req.companyId);
    return response.success(req, res, result, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


router.post('/calculate-sale', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const {
      saleData,
      couponCode,
      customerId
    } = req.body;

    const companyId = req.companyId;

    if (!saleData || !companyId) {
      return response.error(req, res, 'Sale data and company are required', 400);
    }

    const result = await controller.calculateSaleWithCoupon(
      saleData,
      couponCode,
      companyId,
      customerId
    );

    if (result.success) {
      return response.success(req, res, result, 200);
    }
    return response.error(req, res, result.error, 400);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});


module.exports = router;
