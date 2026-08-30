const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const store = require('./store');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateCashRegisterCut } = require('../../middleware/validation');
const Cut = require('./model');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');

const router = express.Router();
const scopeCut = scopeResource(Cut, 'cutId');
router.use(authenticateToken, requireCompanyScope);

const handleRequest = (req, res, promise) => {
  promise
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, err.message, 500, err));
};

router.post('/create', authenticateToken, requireRole(['admin', 'manager']), validateCashRegisterCut, (req, res) => {
  const cutData = { 
    ...req.body, 
    administratorId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  handleRequest(req, res, controller.createCashRegisterCut(cutData));
});

router.get('/reports/general', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { ...req.query, companyId: Helper.getCompanyId(req) };
  handleRequest(req, res, controller.generateCashRegisterReport(filters));
});

router.get('/reports/daily/:date', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  handleRequest(req, res, controller.getDailyCashRegisterReport(req.params.date, Helper.getCompanyId(req)));
});

router.get('/reports/user/:userId', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return response.error(req, res, 'Start date and end date required', 400);
  }
  return handleRequest(req, res, controller.getUserCashRegisterReport(
    req.params.userId, startDate, endDate, Helper.getCompanyId(req)
  ));
});

router.get('/reports/cashregister/:cashRegister', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return response.error(req, res, 'Start date and end date required', 400);
  }
  return handleRequest(req, res, controller.getCashRegisterReport(
    req.params.cashRegister, startDate, endDate, Helper.getCompanyId(req)
  ));
});
router.get('/', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { ...req.query, companyId: Helper.getCompanyId(req) };
  handleRequest(req, res, controller.getCashRegisterCuts(filters));
});


router.get('/:cutId/pdf', authenticateToken, requireRole(['admin', 'manager']), scopeCut, (req, res) => {
  store.generateCutPDFDirect(req.params.cutId, res)
    .catch(err => response.error(req, res, err.message, 500, err));
});


router.get('/:cutId', authenticateToken, requireRole(['admin', 'manager']), scopeCut, (req, res) => {
  handleRequest(req, res, controller.getCashRegisterCutById(req.params.cutId));
});


module.exports = router;
