const express = require('express');
const response = require('../../network');
const Helper = require('../../helpers');
const controller = require('./controller');
const sales = require('../sales/controller');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { requireCompanyScope } = require('../../middleware/tenant');
const { requireBranchAccess } = require('../../middleware/branch');
const { validatePromotionCreate, validatePromotionUpdate, validatePromotionSimulation } = require('../../middleware/validation');

const router = express.Router();
const auth = [authenticateToken, requireCompanyScope, requireRole(['admin'])];

function handleError(req, res, error) {
  response.error(req, res, error.message || 'Error de promoción', error.status || 400, error);
}

router.post('/', ...auth, validatePromotionCreate, async (req, res) => {
  try {
    const promotion = await controller.add(req.body, req.companyId, Helper.getUserId(req));
    return response.success(req, res, promotion, 201);
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.get('/', ...auth, async (req, res) => {
  try {
    const promotions = await controller.list(req.companyId, req.query);
    return response.success(req, res, promotions, 200);
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.get('/report', ...auth, async (req, res) => {
  try {
    const report = await controller.report(req.companyId, req.query);
    return response.success(req, res, report, 200);
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.post('/simulate', ...auth, validatePromotionSimulation, requireBranchAccess('branchId', { optional: true }), async (req, res) => {
  try {
    const at = req.body.at ? new Date(req.body.at) : new Date();
    const snapshots = await sales.createProductSnapshots(req.body.products, req.companyId, null, req.body.branchId);
    const promotions = await controller.listActive(req.companyId, at);
    const quote = controller.quote({
      companyId: req.companyId,
      products: snapshots,
      customerId: req.body.customerId,
      branchId: req.body.branchId,
      now: at,
      promotions,
      taxPolicyVersion: 'promotion_v1_before_tax',
    });
    return response.success(req, res, quote, 200);
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.get('/:promotionId', ...auth, async (req, res) => {
  try {
    const promotion = await controller.get(req.params.promotionId, req.companyId);
    return response.success(req, res, promotion, 200);
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.patch('/:promotionId', ...auth, validatePromotionUpdate, async (req, res) => {
  try {
    const promotion = await controller.update(
      req.params.promotionId,
      req.body,
      req.companyId,
      Helper.getUserId(req),
    );
    return response.success(req, res, promotion, 200);
  } catch (error) {
    return handleError(req, res, error);
  }
});

router.delete('/:promotionId', ...auth, async (req, res) => {
  try {
    const promotion = await controller.archive(req.params.promotionId, req.companyId, Helper.getUserId(req));
    return response.success(req, res, promotion, 200);
  } catch (error) {
    return handleError(req, res, error);
  }
});

module.exports = router;
