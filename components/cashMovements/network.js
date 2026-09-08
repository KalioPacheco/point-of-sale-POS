const express = require('express');
const { param, query } = require('express-validator');
const { getShiftLedger } = require('./shiftLedger');
const response = require('../../network');
const controller = require('./controller');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const {
  validateCashMovementCreate,
  validateCashMovementRequest,
  validateCashMovementDecision,
  validateCashMovementUpdate,
  handleValidationErrors
} = require('../../middleware/validation');
const Movement = require('./model');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');
const { resolveCashRegisterContext, assignedBranchIds, isAdmin, requireScopedBranchAccess } = require('../../middleware/branch');

const router = express.Router();
const scopeMovement = scopeResource(Movement, 'movementId');
router.use(authenticateToken, requireCompanyScope);


const handleRequest = (req, res, promise) => {
  promise
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, err.message, 500, err));
};

router.post('/create', authenticateToken, requireRole(['admin', 'manager']), resolveCashRegisterContext(), validateCashMovementCreate, (req, res) => {
  const movementData = {
    ...req.body,
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined,
    authorizedBy: Helper.getUserId(req),
    branchId: req.cashRegisterContext?.branch,
    cashRegisterId: req.cashRegisterContext?._id,
    cashRegister: req.cashRegisterContext?.code || req.body.cashRegister,
  };
  handleRequest(req, res, controller.createMovement(movementData));
});

router.post('/request', requireRole(['admin', 'manager', 'vendedor']), resolveCashRegisterContext(), validateCashMovementRequest, (req, res) => {
  const movementData = {
    ...req.body,
    userId: Helper.getUserId(req),
    companyId: req.companyId,
    branchId: req.cashRegisterContext?.branch,
    cashRegisterId: req.cashRegisterContext?._id,
    cashRegister: req.cashRegisterContext?.code || req.body.cashRegister,
  };
  handleRequest(req, res, controller.requestMovement(movementData));
});

router.get('/pending', requireRole(['admin', 'manager', 'vendedor']), (req, res) => {
  handleRequest(req, res, controller.getPendingMovements({
    companyId: req.companyId,
    userId: Helper.getUserId(req),
    role: req.user.role,
    branchIds: isAdmin(req.user) ? null : assignedBranchIds(req.user)
  }));
});

router.post('/:movementId/approve', requireRole(['admin', 'manager']), scopeMovement, requireScopedBranchAccess(),
  validateCashMovementDecision, (req, res) => {
    handleRequest(req, res, controller.approveRequestedMovement(
      req.params.movementId, req.companyId, Helper.getUserId(req), req.body.approvalNote
    ));
  });

router.post('/:movementId/reject', requireRole(['admin', 'manager']), scopeMovement, requireScopedBranchAccess(),
  validateCashMovementDecision, (req, res) => {
    handleRequest(req, res, controller.rejectRequestedMovement(
      req.params.movementId, req.companyId, Helper.getUserId(req), req.body.approvalNote
    ));
  });

router.get('/shift/:shiftId', requireRole(['admin', 'manager', 'vendedor']),
  param('shiftId').isMongoId(), query('page').optional().isInt({ min: 0 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), handleValidationErrors,
  (req, res) => handleRequest(req, res, getShiftLedger({
    shiftId: req.params.shiftId, companyId: req.companyId,
    userId: Helper.getUserId(req), role: req.user.role,
    branchIds: isAdmin(req.user) ? null : assignedBranchIds(req.user),
    page: req.query.page, limit: req.query.limit
  })));


router.get('/summary/daily/:date', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const companyId = Helper.getCompanyId(req);
  handleRequest(req, res, controller.getDailySummary(req.params.date, companyId, isAdmin(req.user) ? undefined : assignedBranchIds(req.user)));
});


router.get('/user/:userId', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { ...req.query, companyId: req.companyId, branchIds: isAdmin(req.user) ? undefined : assignedBranchIds(req.user) };
  handleRequest(req, res, controller.getUserMovements(req.params.userId, filters));
});


router.get('/cashregister/:cashRegister', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { ...req.query, companyId: req.companyId, branchIds: isAdmin(req.user) ? undefined : assignedBranchIds(req.user) };
  handleRequest(req, res, controller.getCashRegisterMovements(req.params.cashRegister, filters));
});


router.get('/daterange/:startDate/:endDate', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { startDate, endDate } = req.params;
  const companyId = Helper.getCompanyId(req);
  handleRequest(req, res, controller.getMovementsByDateRange(startDate, endDate, companyId, isAdmin(req.user) ? undefined : assignedBranchIds(req.user)));
});



router.get('/', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined,
    branchIds: isAdmin(req.user) ? undefined : assignedBranchIds(req.user)
  };
  handleRequest(req, res, controller.getMovements(filters));
});


router.put('/:movementId', authenticateToken, requireRole(['admin', 'manager']), scopeMovement, requireScopedBranchAccess(), validateCashMovementUpdate, (req, res) => {
  const updateData = {
    ...req.body,
    authorizedBy: Helper.getUserId(req)
  };
  handleRequest(req, res, controller.updateMovement(req.params.movementId, updateData));
});


router.delete('/:movementId', authenticateToken, requireRole(['admin', 'manager']), scopeMovement, requireScopedBranchAccess(), (req, res) => {
  handleRequest(req, res, controller.deleteMovement(req.params.movementId));
});


router.get('/:movementId', authenticateToken, requireRole(['admin', 'manager']), scopeMovement, requireScopedBranchAccess(), (req, res) => {
  handleRequest(req, res, controller.getMovementById(req.params.movementId));
});





module.exports = router;
