const express = require('express');
const response = require('../../network');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { requireCompanyScope } = require('../../middleware/tenant');
const { requireBranchAccess, canAccessBranch, assignedBranchIds, isAdmin } = require('../../middleware/branch');
const { StockTransfer, PurchaseReceipt, PhysicalCount, InventoryAdjustment } = require('./model');
const {
  validatePurchaseReceiptCreate,
  validatePhysicalCountCreate,
  validateInventoryAdjustmentCreate,
  validateInventoryApproval,
  validateStockTransferCreate,
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

async function multiBranchInventory(req, res, next) {
  try {
    if (!await controller.companyUsesBranchInventory(req.companyId)) {
      return response.error(req, res, 'El inventario por sucursal aún no está activado para esta empresa', 409);
    }
    return next();
  } catch (error) { return next(error); }
}

async function optionalInventoryBranchAccess(req, res, next) {
  try {
    const enabled = await controller.companyUsesBranchInventory(req.companyId);
    const branchId = req.body?.branchId || req.query?.branchId;
    if (enabled && !branchId) return response.error(req, res, 'Sucursal requerida', 400);
    if ((enabled || branchId) && branchId) return requireBranchAccess('branchId')(req, res, next);
    return next();
  } catch (error) { return next(error); }
}

function scopedInventoryDocument(Model, param) {
  return async (req, res, next) => {
    try {
      const document = await Model.findOne({ _id: req.params[param], company: req.companyId }).select('branch').lean();
      if (!document) return response.error(req, res, 'Recurso no encontrado', 404);
      if (document.branch && !canAccessBranch(req.user, document.branch)) return response.error(req, res, 'Recurso no encontrado', 404);
      return next();
    } catch (error) { return next(error); }
  };
}

async function scopedTransfer(req, res, next) {
  try {
    const transfer = await StockTransfer.findOne({ _id: req.params.transferId, company: req.companyId }).lean();
    if (!transfer) return response.error(req, res, 'Transferencia no encontrada', 404);
    const action = req.params.action;
    const branch = action === 'receive' ? transfer.destinationBranch : transfer.originBranch;
    if (!canAccessBranch(req.user, branch)) return response.error(req, res, 'Transferencia no encontrada', 404);
    req.stockTransfer = transfer;
    return next();
  } catch (error) { return next(error); }
}

router.get('/reorder', ...authorizers, optionalInventoryBranchAccess, async (req, res) => {
  try {
    return response.success(req, res, await controller.reorderReport(req.companyId, {
      branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    }));
  } catch (error) { return sendError(req, res, error); }
});

router.get('/receipts', ...authorizers, optionalInventoryBranchAccess, async (req, res) => {
  try {
    return response.success(req, res, await controller.listReceipts(req.companyId, {
      status: statusFilter(req),
      supplierId: typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined,
      branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    }));
  } catch (error) { return sendError(req, res, error); }
});

router.post('/receipts', ...authorizers, validatePurchaseReceiptCreate, optionalInventoryBranchAccess, async (req, res) => {
  try {
    const result = await controller.createReceipt(req.body, req.companyId, req.user.userId, req.get('Idempotency-Key'));
    return response.success(req, res, result, result.replayed ? 200 : 201);
  } catch (error) { return sendError(req, res, error); }
});

router.post('/receipts/:receiptId/approve', ...authorizers, scopedInventoryDocument(PurchaseReceipt, 'receiptId'), validateInventoryApproval, async (req, res) => {
  try {
    return response.success(req, res, await controller.approveReceipt(
      req.params.receiptId, req.companyId, req.user.userId, req.body.approvalNote
    ));
  } catch (error) { return sendError(req, res, error); }
});

router.get('/counts', ...authenticated, optionalInventoryBranchAccess, async (req, res) => {
  try {
    return response.success(req, res, await controller.listPhysicalCounts(req.companyId, {
      status: statusFilter(req), branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    }));
  } catch (error) { return sendError(req, res, error); }
});

router.post('/counts', ...authenticated, validatePhysicalCountCreate, optionalInventoryBranchAccess, async (req, res) => {
  try {
    return response.success(req, res, await controller.createPhysicalCount(req.body, req.companyId, req.user.userId, req.get('Idempotency-Key')), 201);
  } catch (error) { return sendError(req, res, error); }
});

router.post('/counts/:countId/approve', ...authorizers, scopedInventoryDocument(PhysicalCount, 'countId'), validateInventoryApproval, async (req, res) => {
  try {
    return response.success(req, res, await controller.approvePhysicalCount(
      req.params.countId, req.companyId, req.user.userId, req.body.approvalNote
    ));
  } catch (error) { return sendError(req, res, error); }
});

router.get('/adjustments', ...authenticated, optionalInventoryBranchAccess, async (req, res) => {
  try {
    return response.success(req, res, await controller.listAdjustments(req.companyId, {
      status: statusFilter(req), branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
    }));
  } catch (error) { return sendError(req, res, error); }
});

router.post('/adjustments', ...authenticated, validateInventoryAdjustmentCreate, optionalInventoryBranchAccess, async (req, res) => {
  try {
    return response.success(req, res, await controller.createAdjustment(req.body, req.companyId, req.user.userId, req.get('Idempotency-Key')), 201);
  } catch (error) { return sendError(req, res, error); }
});

router.post('/adjustments/:adjustmentId/approve', ...authorizers, scopedInventoryDocument(InventoryAdjustment, 'adjustmentId'), validateInventoryApproval, async (req, res) => {
  try {
    return response.success(req, res, await controller.approveAdjustment(
      req.params.adjustmentId, req.companyId, req.user.userId, req.body.approvalNote
    ));
  } catch (error) { return sendError(req, res, error); }
});

router.get('/levels', ...authenticated, multiBranchInventory, async (req, res) => {
  try {
    const consolidated = req.query.scope === 'company';
    if (consolidated && !isAdmin(req.user)) return response.error(req, res, 'Sólo un administrador puede consultar el consolidado', 403);
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    if (!consolidated && !branchId) return response.error(req, res, 'Sucursal requerida', 400);
    if (!consolidated && !canAccessBranch(req.user, branchId)) return response.error(req, res, 'Sucursal no encontrada', 404);
    return response.success(req, res, await controller.getLevels(req.companyId, { branchId, consolidated }));
  } catch (error) { return sendError(req, res, error); }
});

router.get('/transfers', ...authenticated, multiBranchInventory, async (req, res) => {
  try {
    return response.success(req, res, await controller.listTransfers(req.companyId, {
      branchIds: isAdmin(req.user) ? undefined : assignedBranchIds(req.user),
    }));
  } catch (error) { return sendError(req, res, error); }
});

router.post('/transfers', ...authenticated, multiBranchInventory,
  validateStockTransferCreate, requireBranchAccess('originBranchId'), requireBranchAccess('destinationBranchId'), async (req, res) => {
    try {
      const result = await controller.createTransfer(req.body, req.companyId, req.user.userId, req.get('Idempotency-Key'));
      return response.success(req, res, result, result.replayed ? 200 : 201);
    } catch (error) { return sendError(req, res, error); }
  });

router.post('/transfers/:transferId/:action(approve|dispatch|receive|cancel)', ...authenticated, multiBranchInventory,
  scopedTransfer, async (req, res) => {
    try {
      if (req.params.action === 'cancel' && req.user.role === 'vendedor' && String(req.stockTransfer.requestedBy) !== String(req.user.userId)) {
        return response.error(req, res, 'No puedes cancelar una transferencia ajena', 403);
      }
      const transfer = await controller.transitionTransfer(req.params.transferId, req.companyId, req.user, req.params.action);
      return response.success(req, res, transfer);
    } catch (error) { return sendError(req, res, error); }
  });

module.exports = router;
