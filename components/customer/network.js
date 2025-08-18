/* eslint-disable no-undef */
/* eslint-disable consistent-return */
const express = require('express');
const controller = require('./controller');
const response = require('../../network');
const { validateCoupon } = require('../../middleware/validation');

const router = express.Router();


router.post('/', validateCoupon, async (req, res) => {
  try {
    const couponData = {
      ...req.body,
      company: req.body.company || req.user?.company,
      createdBy: req.user?.id
    };

    const coupon = await controller.addCoupon(couponData);
    return response.success(req, res, coupon, 201);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});


router.get('/', async (req, res) => {
  try {
    const { company, status, discountType, active, expired, code, name, limit } = req.query;
    const companyId = company || req.user?.company;
    
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

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await controller.listCoupons(id);
    
    if (!coupon) {
      return response.error(req, res, 'Coupon not found', 404);
    }
    
    return response.success(req, res, coupon, 200);
  } catch (error) {
    response.error(req, res, error.message, 404);
  }
});


router.put('/:id', validateCoupon, async (req, res) => {

  try {
    const { id } = req.params;
    const updatedCoupon = await controller.updateCoupon(id, req.body);
    return response.success(req, res, updatedCoupon, 200);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await controller.removeCoupon(id);
    return response.success(req, res, result, 200);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});

router.post('/validate', async (req, res) => {
  try {
    const { 
      code, 
      company, 
      saleData,
      customerId
    } = req.body;

    const companyId = company || req.user?.company;
    
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

router.post('/apply', async (req, res) => {
  try {
    const {
      code,
      company,
      saleData,
      customerId
    } = req.body;

    const companyId = company || req.user?.company;

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

router.get('/active/list', async (req, res) => {
  try {
    const { company } = req.query;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const activeCoupons = await controller.getActiveCoupons(companyId);
    return response.success(req, res, activeCoupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/cashier/list', async (req, res) => {
  try {
    const { company } = req.query;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const cashierCoupons = await controller.getCouponsForCashier(companyId);
    return response.success(req, res, cashierCoupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/search/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const { company } = req.query;
    const companyId = company || req.user?.company;
    
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


router.post('/generate-code', async (req, res) => {
  try {
    const { prefix } = req.body;
    const code = controller.generateCouponCode(prefix);
    return response.success(req, res, { code }, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/check-code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { company } = req.query;
    const companyId = company || req.user?.company;
    
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

router.get('/stats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await controller.getCouponStats(id);
    return response.success(req, res, stats, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/report/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const report = await controller.getCouponsReport(companyId, startDate, endDate);
    return response.success(req, res, report, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/customer/history', async (req, res) => {
  try {
    const { customerId, company } = req.query;
    const companyId = company || req.user?.company;
    
    if (!customerId || !companyId) {
      return response.error(req, res, 'Customer ID and Company ID are required', 400);
    }

    const history = await controller.getCustomerCouponHistory(customerId, companyId);
    return response.success(req, res, history, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.post('/maintenance/expire', async (req, res) => {
  try {
    const result = await controller.expireCoupons();
    return response.success(req, res, result, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.post('/calculate-sale', async (req, res) => {
  try {
    const {
      saleData,
      couponCode,
      company,
      customerId
    } = req.body;

    const companyId = company || req.user?.company;

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