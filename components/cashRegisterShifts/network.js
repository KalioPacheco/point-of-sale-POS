const express = require('express');
const response = require('../../network');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const controller = require('./controller');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { resolveCashRegisterContext, assignedBranchIds, isAdmin, requireScopedBranchAccess } = require('../../middleware/branch');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');
const Shift = require('./model');

const router = express.Router();
const auth = [passportConfig.isAuth, authenticateToken, requireCompanyScope, requireRole(['vendedor', 'manager', 'admin'])];
const scopeShift = scopeResource(Shift, 'shiftId');

function handle(req, res, promise, successStatus = 200) {
  promise
    .then(data => response.success(req, res, data, successStatus))
    .catch(error => response.error(req, res, error.message, 400, error));
}

router.get('/current', ...auth, resolveCashRegisterContext(), (req, res) => {
  const cashRegister = req.cashRegisterContext?.code || req.query.cashRegister || 'CAJA-1';
  handle(req, res, controller.getCurrentShift(
    Helper.getCompanyId(req),
    cashRegister,
    Helper.getUserId(req),
    req.cashRegisterContext
  ));
});

router.get(
  '/pending-cuts',
  passportConfig.isAuth,
  authenticateToken,
  requireCompanyScope,
  requireRole(['manager', 'admin']),
  (req, res) => {
    handle(req, res, controller.listPendingCuts(
      Helper.getCompanyId(req),
      isAdmin(req.user) ? null : assignedBranchIds(req.user)
    ));
  }
);

router.post('/open', ...auth, resolveCashRegisterContext(), (req, res) => {
  handle(req, res, controller.openShift({
    companyId: Helper.getCompanyId(req),
    cashierId: Helper.getUserId(req),
    branchId: req.cashRegisterContext?.branch,
    cashRegisterId: req.cashRegisterContext?._id,
    cashRegister: req.cashRegisterContext?.code || req.body.cashRegister || 'CAJA-1',
    openingCash: Number(req.body.openingCash),
    notes: req.body.notes
  }), 201);
});

router.post('/:shiftId/close', ...auth, scopeShift, requireScopedBranchAccess(), (req, res) => {
  handle(req, res, controller.closeShift(
    req.params.shiftId,
    Helper.getCompanyId(req),
    Number(req.body.closingCash),
    req.body.notes,
    Helper.getUserId(req),
    req.user.role
  ));
});

module.exports = router;
