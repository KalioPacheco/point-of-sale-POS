/* eslint-disable consistent-return */
const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const Helper = require('../../helpers');
const { validateSale, validatePromotionSimulation } = require('../../middleware/validation');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');
const { resolveCashRegisterContext, assignedBranchIds, isAdmin, requireBranchAccess, requireScopedBranchAccess } = require('../../middleware/branch');
const Sale = require('./model');

const router = express.Router();
const scopeSale = scopeResource(Sale, 'sellId');

const handleSaleError = (req, res, err) => {
  const message = err && err.message ? err.message : 'Internal error';
  const isStockConflict =
    err?.code === 'INSUFFICIENT_STOCK'
    || /stock insuficiente|insufficient stock/i.test(message);

  response.error(req, res, message, err.status || (isStockConflict ? 409 : 500), err);
};



const addSell = function addSell(req, res) {
  const sell = { ...req.body };
  const companyId = Helper.getCompanyId(req);
  const idempotencyKey = req.headers['idempotency-key'];

  sell.companyId = companyId;
  sell.createdBy = Helper.getUserId(req);
  if (req.cashRegisterContext) {
    sell.branchId = req.cashRegisterContext.branch;
    sell.cashRegisterId = req.cashRegisterContext._id;
    sell.cashRegister = req.cashRegisterContext.code;
  }

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

const listSales = function listSales(req, res) {
  const { sellId } = req.params;
  const companyId = Helper.getCompanyId(req);
  const cashierId = req.user.role === 'vendedor' ? Helper.getUserId(req) : undefined;
  controller
    .listSales(sellId, companyId, cashierId, {
      ...req.query,
      branchIds: isAdmin(req.user) ? undefined : assignedBranchIds(req.user),
      paginated: req.query.paginated === 'true'
    })
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listSaleOperationsForReports = function listSaleOperationsForReports(req, res) {
  const scope = req.query.scope;
  if (scope && !['branch', 'company'].includes(scope)) {
    return response.error(req, res, 'Alcance de reporte inválido', 400);
  }
  if (scope === 'company' && !isAdmin(req.user)) {
    return response.error(req, res, 'Sólo un administrador puede consultar el consolidado', 403);
  }
  if (scope === 'branch' && !req.query.branchId) {
    return response.error(req, res, 'Sucursal requerida para el reporte por sucursal', 400);
  }
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const filters = {
    page: req.query.page, limit: req.query.limit,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    cashRegister: req.query.cashRegister,
    cashierId: req.query.cashierId,
    branchId,
    // The old, scope-less endpoint stays compatible. New clients always send
    // an explicit scope and branch, so an administrator only gets company-wide
    // results after deliberately selecting that option.
    branchIds: scope === 'company' ? undefined : branchId ? [branchId] : (isAdmin(req.user) ? undefined : assignedBranchIds(req.user)),
    companyId: Helper.getCompanyId(req)
  };
  require('./reportPage')(filters)
    .then(data => response.success(req, res, req.query.paginated === 'true' ? data : data.items, 200))
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
  if (req.cashRegisterContext) {
    sell.branchId = req.cashRegisterContext.branch;
    sell.cashRegisterId = req.cashRegisterContext._id;
    sell.cashRegister = req.cashRegisterContext.code;
  }

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
    customerId,
    branchId: req.cashRegisterContext?.branch || req.branch?._id || req.body.branchId,
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

const previewSaleWithPromotions = function previewSaleWithPromotions(req, res) {
  const saleData = {
    products: req.body.products,
    couponCode: req.body.couponCode,
    customerId: req.body.customerId,
    companyId: Helper.getCompanyId(req),
    branchId: req.cashRegisterContext?.branch || req.branch?._id || req.body.branchId,
  };

  controller
    .processSaleWithPromotions(saleData)
    .then(data => response.success(req, res, data, 200))
    .catch((err) => {
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
router.get('/reports', ...canManageSales, requireBranchAccess('branchId', { optional: true }), listSaleOperationsForReports);
router.get('/:sellId', ...canSell, listSales);
router.post('/', ...canSell, resolveCashRegisterContext(), validateSale, addSell);
router.patch('/:sellId', ...canManageSales, scopeSale, requireScopedBranchAccess(), updateSell);
router.delete('/:sellId', ...canManageSales, scopeSale, requireScopedBranchAccess(), removeSell);
router.post('/validate-coupon', ...canSell, validateCoupon);
router.post('/with-coupon', ...canSell, resolveCashRegisterContext(), validateSale, addSellWithCoupon);
router.post('/preview-with-coupon', ...canSell, validatePromotionSimulation, requireBranchAccess('branchId', { optional: true }), resolveCashRegisterContext(), previewSaleWithCoupon);
router.post('/preview', ...canSell, validatePromotionSimulation, requireBranchAccess('branchId', { optional: true }), resolveCashRegisterContext(), previewSaleWithPromotions);
module.exports = router;
