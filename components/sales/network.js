/* eslint-disable consistent-return */
const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const Helper = require('../../helpers');
const { validateSale } = require('../../middleware/validation');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { requireCompanyScope } = require('../../middleware/tenant');

const router = express.Router();

const handleSaleError = (req, res, err) => {
  const message = err && err.message ? err.message : 'Internal error';
  const isStockConflict =
    err?.code === 'INSUFFICIENT_STOCK'
    || /stock insuficiente|insufficient stock/i.test(message);

  response.error(req, res, message, isStockConflict ? 409 : 500, err);
};



const addSell = function addSell(req, res) {
  const sell = { ...req.body };
  const companyId = Helper.getCompanyId(req);
  const idempotencyKey = req.headers['idempotency-key'];

  sell.companyId = companyId;
  sell.createdBy = Helper.getUserId(req);

  if (!idempotencyKey) {
    return response.error(req, res, 'Idempotency-Key header required', 400);
  }

  controller
    .addSell(sell, idempotencyKey)
    .then(data => {
      response.success(req, res, {
        saleId: data.id,
        finalTotal: data.finalTotal,
        change: data.payment?.change || 0,
        message: 'Venta creada correctamente'
      }, 201);
    })
    .catch(err => {
      response.error(req, res, err.message, 400, err);
    });
};

const listSales = function listSales(req, res) {
  const { sellId } = req.params;
  const companyId = Helper.getCompanyId(req);
  const cashierId = req.user.role === 'vendedor' ? Helper.getUserId(req) : undefined;
  controller
    .listSales(sellId, companyId, cashierId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listSaleOperationsForReports = function listSaleOperationsForReports(req, res) {
  const filters = {
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    cashRegister: req.query.cashRegister,
    cashierId: req.query.cashierId,
    companyId: Helper.getCompanyId(req)
  };
  controller
    .listSaleOperationsForReports(filters)
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, 'Internal error', 500, err));
};

const updateSell = function updateSell(req, res) {
  const { sellId } = req.params;
  const sell = req.body;
  const companyId = Helper.getCompanyId(req);
  sell.companyId = companyId;
  controller
    .updateSell(sellId, sell, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeSell = function removeSell(req, res) {
  const { sellId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .removeSell(sellId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};


const validateCoupon = function validateCoupon(req, res) {
  const { couponCode, products, customerId } = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!couponCode || !products || !companyId) {
    return response.error(req, res, 'Faltan datos requeridos', 400);
  }

  controller
    .validateCouponForSale(couponCode, companyId, products, customerId)
    .then(data => {
      if (data.valid) {
        response.success(req, res, data, 200);
      } else {
        response.error(req, res, data.error, 400);
      }
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const addSellWithCoupon = function addSellWithCoupon(req, res) {
  const sell = { ...req.body };
  const companyId = Helper.getCompanyId(req);
  const idempotencyKey = req.headers['idempotency-key'];

  sell.companyId = companyId;
  sell.createdBy = Helper.getUserId(req);

  if (!idempotencyKey) {
    return response.error(req, res, 'Idempotency-Key header required', 400);
  }

  controller
    .addSell(sell, idempotencyKey)
    .then(data => {
      response.success(req, res, {
        saleId: data.id,
        finalTotal: data.finalTotal,
        change: data.payment?.change || 0,
        message: 'Venta creada correctamente'
      }, 201);
    })
    .catch(err => {
      handleSaleError(req, res, err);
    });
};

const previewSaleWithCoupon = function previewSaleWithCoupon(req, res) {
  const { products, couponCode, customerId } = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!products || !companyId) {
    return response.error(req, res, 'Products and company are required', 400);
  }

  const saleData = {
    products,
    couponCode,
    companyId,
    customerId
  };

  controller
    .processSaleWithCoupon(saleData)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      const message = err && err.message ? err.message : 'Internal error';
      const isBusinessValidation = /Cup[oó]n|cupon|m[ií]nima|v[aá]lido|expirad|no encontrado/i.test(message);
      response.error(req, res, message, isBusinessValidation ? 400 : 500, err);
    });
};

const canSell = [
  authenticateToken,
  requireCompanyScope,
  requireRole(['vendedor', 'admin', 'manager'])
];
const canManageSales = [
  authenticateToken,
  requireCompanyScope,
  requireRole(['admin', 'manager'])
];

router.get('/', ...canSell, listSales);
router.get('/reports', ...canManageSales, listSaleOperationsForReports);
router.get('/:sellId', ...canSell, listSales);
router.post('/', ...canSell, validateSale, addSell);
router.patch('/:sellId', ...canManageSales, updateSell);
router.delete('/:sellId', ...canManageSales, removeSell);
router.post('/validate-coupon', ...canSell, validateCoupon);
router.post('/with-coupon', ...canSell, validateSale, addSellWithCoupon);
router.post('/preview-with-coupon', ...canSell, previewSaleWithCoupon);
module.exports = router;
