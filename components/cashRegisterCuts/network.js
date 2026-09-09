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
const { resolveCashRegisterContext, assignedBranchIds, isAdmin, requireBranchAccess, requireScopedBranchAccess } = require('../../middleware/branch');

const router = express.Router();
const scopeCut = scopeResource(Cut, 'cutId');
router.use(authenticateToken, requireCompanyScope);

const handleRequest = (req, res, promise) => {
  promise
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, err.message, 500, err));
};

function reportFilters(req, res) {
  const scope = req.query.scope;
  if (scope && !['branch', 'company'].includes(scope)) {
    response.error(req, res, 'Alcance de reporte inválido', 400);
    return null;
  }
  if (scope === 'company' && !isAdmin(req.user)) {
    response.error(req, res, 'Sólo un administrador puede consultar el consolidado', 403);
    return null;
  }
  if (scope === 'branch' && !req.query.branchId) {
    response.error(req, res, 'Sucursal requerida para el reporte por sucursal', 400);
    return null;
  }
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  return {
    ...req.query,
    companyId: Helper.getCompanyId(req),
    branchId,
    branchIds: scope === 'company' ? undefined : branchId ? [branchId] : (isAdmin(req.user) ? undefined : assignedBranchIds(req.user)),
  };
}

router.post('/create', authenticateToken, requireRole(['admin', 'manager']), resolveCashRegisterContext(), validateCashRegisterCut, (req, res) => {
  const cutData = { 
    ...req.body, 
    administratorId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined,
    branchId: req.cashRegisterContext?.branch,
    cashRegisterId: req.cashRegisterContext?._id,
    cashRegister: req.cashRegisterContext?.code || req.body.cashRegister,
  };
  handleRequest(req, res, controller.createCashRegisterCut(cutData));
});

router.get('/reports/general', authenticateToken, requireRole(['admin', 'manager']), requireBranchAccess('branchId', { optional: true }), (req, res) => {
  const filters = reportFilters(req, res);
  if (!filters) return undefined;
  handleRequest(req, res, controller.generateCashRegisterReport(filters));
});

router.get('/reports/daily/:date', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  handleRequest(req, res, controller.getDailyCashRegisterReport(req.params.date, Helper.getCompanyId(req), isAdmin(req.user) ? undefined : assignedBranchIds(req.user)));
});

router.get('/reports/user/:userId', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return response.error(req, res, 'Start date and end date required', 400);
  }
  return handleRequest(req, res, controller.getUserCashRegisterReport(
    req.params.userId, startDate, endDate, Helper.getCompanyId(req), isAdmin(req.user) ? undefined : assignedBranchIds(req.user)
  ));
});

router.get('/reports/cashregister/:cashRegister', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return response.error(req, res, 'Start date and end date required', 400);
  }
  return handleRequest(req, res, controller.getCashRegisterReport(
    req.params.cashRegister, startDate, endDate, Helper.getCompanyId(req), isAdmin(req.user) ? undefined : assignedBranchIds(req.user)
  ));
});
router.get('/', authenticateToken, requireRole(['admin', 'manager']), requireBranchAccess('branchId', { optional: true }), (req, res) => {
  const filters = reportFilters(req, res);
  if (!filters) return undefined;
  handleRequest(req, res, controller.getCashRegisterCuts(filters));
});


router.get('/:cutId/pdf', authenticateToken, requireRole(['admin', 'manager']), scopeCut, requireScopedBranchAccess(), (req, res) => {
  store.generateCutPDFDirect(req.params.cutId, res)
    .catch(err => response.error(req, res, err.message, 500, err));
});


router.get('/:cutId', authenticateToken, requireRole(['admin', 'manager']), scopeCut, requireScopedBranchAccess(), (req, res) => {
  handleRequest(req, res, controller.getCashRegisterCutById(req.params.cutId));
});


module.exports = router;
