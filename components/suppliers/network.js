const express = require('express');
const response = require('../../network');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');
const { validateSupplierCreate, validateSupplierUpdate } = require('../../middleware/validation');
const Supplier = require('./model');
const controller = require('./controller');

const router = express.Router();
const authorize = [authenticateToken, requireCompanyScope, requireRole(['admin', 'manager'])];
const scopeSupplier = scopeResource(Supplier, 'supplierId');

function sendError(req, res, error) {
  return response.error(req, res, error.message || 'Internal error', error.status || 500, error);
}

router.get('/', ...authorize, async (req, res) => {
  try {
    const data = await controller.list(req.companyId, {
      includeDisabled: req.query.includeDisabled === 'true',
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    });
    return response.success(req, res, data);
  } catch (error) { return sendError(req, res, error); }
});

router.post('/', ...authorize, validateSupplierCreate, async (req, res) => {
  try {
    const data = await controller.create(req.body, req.companyId, req.user.userId);
    return response.success(req, res, data, 201);
  } catch (error) { return sendError(req, res, error); }
});

router.patch('/:supplierId', ...authorize, scopeSupplier, validateSupplierUpdate, async (req, res) => {
  try {
    const data = await controller.update(req.params.supplierId, req.body, req.companyId);
    return response.success(req, res, data);
  } catch (error) { return sendError(req, res, error); }
});

module.exports = router;
