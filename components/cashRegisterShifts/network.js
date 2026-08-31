const express = require('express');
const response = require('../../network');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const controller = require('./controller');
const { authenticateToken, requireRole } = require('../../middleware/auth');

const router = express.Router();
const auth = [passportConfig.isAuth, authenticateToken, requireRole(['vendedor', 'manager', 'admin'])];

function handle(req, res, promise, successStatus = 200) {
  promise
    .then(data => response.success(req, res, data, successStatus))
    .catch(error => response.error(req, res, error.message, 400, error));
}

router.get('/current', ...auth, (req, res) => {
  const cashRegister = req.query.cashRegister || 'CAJA-1';
  handle(req, res, controller.getCurrentShift(
    Helper.getCompanyId(req),
    cashRegister,
    Helper.getUserId(req)
  ));
});

router.get(
  '/pending-cuts',
  passportConfig.isAuth,
  authenticateToken,
  requireRole(['manager', 'admin']),
  (req, res) => {
    handle(req, res, controller.listPendingCuts(Helper.getCompanyId(req)));
  }
);

router.post('/open', ...auth, (req, res) => {
  handle(req, res, controller.openShift({
    companyId: Helper.getCompanyId(req),
    cashierId: Helper.getUserId(req),
    cashRegister: req.body.cashRegister || 'CAJA-1',
    openingCash: Number(req.body.openingCash),
    notes: req.body.notes
  }), 201);
});

router.post('/:shiftId/close', ...auth, (req, res) => {
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
