const express = require('express');
const controller = require('./controller');
const response = require('../../network/response');

const router = express.Router();

// Crear cupón
router.post('/', async (req, res) => {
  try {
    const couponData = {
      ...req.body,
      company: req.body.company || req.user?.company,
      createdBy: req.user?.id
    };

    const coupon = await controller.addCoupon(couponData);
    response.success(req, res, coupon, 201);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});

// Listar cupones
router.get('/', async (req, res) => {
  try {
    const { company } = req.query;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const coupons = await controller.listCoupons(null, companyId);
    response.success(req, res, coupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Obtener cupón específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await controller.listCoupons(id);
    response.success(req, res, coupon, 200);
  } catch (error) {
    response.error(req, res, error.message, 404);
  }
});

// Actualizar cupón
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedCoupon = await controller.updateCoupon(id, req.body);
    response.success(req, res, updatedCoupon, 200);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});

// Eliminar cupón 
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await controller.removeCoupon(id);
    response.success(req, res, result, 200);
  } catch (error) {
    response.error(req, res, error.message, 400);
  }
});

// Validar cupón por código
router.post('/validate', async (req, res) => {
  try {
    const { 
      code, 
      company, 
      customer = {}, 
      cartSubtotal = 0, 
      cartProducts = [] 
    } = req.body;

    const companyId = company || req.user?.company;
    
    if (!code || !companyId) {
      return response.error(req, res, 'Código de cupón y empresa son requeridos', 400);
    }

    const validation = await controller.validateCoupon(
      code, 
      companyId, 
      customer, 
      cartSubtotal, 
      cartProducts
    );

    if (validation.valid) {
      response.success(req, res, validation, 200);
    } else {
      response.error(req, res, validation.error, 400);
    }
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Aplicar cupón a una venta
router.post('/apply', async (req, res) => {
  try {
    const {
      saleId,
      couponCode,
      customer = {},
      cartData
    } = req.body;

    const cashierId = req.user?.id;

    if (!saleId || !couponCode || !cartData) {
      return response.error(req, res, 'Datos incompletos para aplicar cupón', 400);
    }

    const result = await controller.applyCouponToSale(
      saleId,
      couponCode,
      customer,
      cashierId,
      cartData
    );

    if (result.success) {
      response.success(req, res, result, 200);
    } else {
      response.error(req, res, result.error, 400);
    }
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Obtener cupones activos
router.get('/active/list', async (req, res) => {
  try {
    const { company } = req.query;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const activeCoupons = await controller.getActiveCoupons(companyId);
    response.success(req, res, activeCoupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Generar código de cupón automático
router.post('/generate-code', async (req, res) => {
  try {
    const { prefix, length } = req.body;
    const code = await controller.generateCouponCode(prefix, length);
    response.success(req, res, { code }, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Obtener estadísticas de cupones
router.get('/statistics/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { dateFrom, dateTo } = req.query;

    const stats = await controller.getCouponStatistics(companyId, dateFrom, dateTo);
    response.success(req, res, stats, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Desactivar cupones expirados
router.post('/maintenance/deactivate-expired', async (req, res) => {
  try {
    const { company } = req.body;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const result = await controller.deactivateExpiredCoupons(companyId);
    response.success(req, res, result, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Búsqueda de cupones por código (para autocompletado)
router.get('/search/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { company } = req.query;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    if (code.length < 3) {
      return response.success(req, res, [], 200);
    }

    const coupons = await controller.listCoupons(null, companyId);
    const filtered = coupons.filter(coupon => 
      coupon.code.toLowerCase().includes(code.toLowerCase()) ||
      coupon.name.toLowerCase().includes(code.toLowerCase())
    ).slice(0, 10);

    const suggestions = filtered.map(coupon => ({
      id: coupon._id,
      code: coupon.code,
      name: coupon.name,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      validUntil: coupon.validUntil,
      active: coupon.active
    }));

    response.success(req, res, suggestions, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Verificar disponibilidad de código
router.get('/check-code/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { company } = req.query;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const store = require('./store');
    const existingCoupon = await store.findByCode(code, companyId);
    
    response.success(req, res, {
      available: !existingCoupon,
      exists: !!existingCoupon
    }, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

// Obtener cupones aplicables a un carrito específico
router.post('/applicable', async (req, res) => {
  try {
    const { products, subtotal, customer, company } = req.body;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const activeCoupons = await controller.getActiveCoupons(companyId);
    
    const applicableCoupons = [];
    
    for (const coupon of activeCoupons) {
      const validation = await controller.validateCoupon(
        coupon.code,
        companyId,
        customer || {},
        subtotal || 0,
        products || []
      );
      
      if (validation.valid) {
        applicableCoupons.push({
          ...coupon,
          potentialDiscount: validation.discount
        });
      }
    }

    response.success(req, res, applicableCoupons, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

router.get('/customer/history', async (req, res) => {
  try {
    const { customerId, phone, email, company } = req.query;
    const companyId = company || req.user?.company;
    
    if (!companyId) {
      return response.error(req, res, 'Company ID is required', 400);
    }

    const customerInfo = { id: customerId, phone, email };
    const store = require('./store');
    const history = await store.getCouponUsageByCustomer(customerInfo, companyId);
    
    response.success(req, res, history, 200);
  } catch (error) {
    response.error(req, res, error.message, 500);
  }
});

module.exports = router;