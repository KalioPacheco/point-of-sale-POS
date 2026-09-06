const express = require('express');
const response = require('../../network');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { requireCompanyScope } = require('../../middleware/tenant');
const {
  validatePurchaseReceiptCreate,
  validatePhysicalCountCreate,
  validateInventoryAdjustmentCreate,
  validateInventoryApproval,
} = require('../../middleware/validation');
const controller = require('./controller');

const router = express.Router();
const authenticated = [authenticateToken, requireCompanyScope];
const authorizers = [...authenticated, requireRole(['admin', 'manager'])];

function sendError(req, res, error) {
  return response.error(req, res, error.message || 'Internal error', error.status || 500, error);
}

function statusFilter(req) {
  return typeof req.query.status === 'string' ? req.query.status : undefined;
}

router.get('/reorder', ...authorizers, async (req, res) => {
  try {
    return response.success(req, res, await controller.reorderReport(req.companyId));
  } catch (error) { return sendError(req, res, error); }
});

router.get('/receipts', ...authorizers, async (req, res) => {
  try {
    return response.success(req, res, await controller.listReceipts(req.companyId, {
      status: statusFilter(req),
      supplierId: typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined,
    }));
  } catch (error) { return sendError(req, res, error); }
});

router.post('/receipts', ...authorizers, validatePurchaseReceiptCreate, async (req, res) => {
  try {
    const result = await controller.createReceipt(req.body, req.companyId, req.user.userId, req.get('Idempotency-Key'));
    return response.success(req, res, result, result.replayed ? 200 : 201);
  } catch (error) { return sendError(req, res, error); }
});

router.post('/receipts/:receiptId/approve', ...authorizers, validateInventoryApproval, async (req, res) => {
  try {
    return response.success(req, res, await controller.approveReceipt(
      req.params.receiptId, req.companyId, req.user.userId, req.body.approvalNote
    ));
  } catch (error) { return sendError(req, res, error); }
});

router.get('/counts', ...authenticated, async (req, res) => {
  try {
    return response.success(req, res, await controller.listPhysicalCounts(req.companyId, { status: statusFilter(req) }));
  } catch (error) { return sendError(req, res, error); }
});

router.post('/counts', ...authenticated, validatePhysicalCountCreate, async (req, res) => {
  try {
    return response.success(req, res, await controller.createPhysicalCount(req.body, req.companyId, req.user.userId), 201);
  } catch (error) { return sendError(req, res, error); }
});

router.post('/counts/:countId/approve', ...authorizers, validateInventoryApproval, async (req, res) => {
  try {
    return response.success(req, res, await controller.approvePhysicalCount(
      req.params.countId, req.companyId, req.user.userId, req.body.approvalNote
    ));
  } catch (error) { return sendError(req, res, error); }
});

router.get('/adjustments', ...authenticated, async (req, res) => {
  try {
    return response.success(req, res, await controller.listAdjustments(req.companyId, { status: statusFilter(req) }));
  } catch (error) { return sendError(req, res, error); }
});

router.post('/adjustments', ...authenticated, validateInventoryAdjustmentCreate, async (req, res) => {
  try {
    return response.success(req, res, await controller.createAdjustment(req.body, req.companyId, req.user.userId), 201);
  } catch (error) { return sendError(req, res, error); }
});

router.post('/adjustments/:adjustmentId/approve', ...authorizers, validateInventoryApproval, async (req, res) => {
  try {
    return response.success(req, res, await controller.approveAdjustment(
      req.params.adjustmentId, req.companyId, req.user.userId, req.body.approvalNote
    ));
  } catch (error) { return sendError(req, res, error); }
});

module.exports = router;
