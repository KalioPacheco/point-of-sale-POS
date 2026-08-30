const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateCashMovementCreate, validateCashMovementUpdate } = require('../../middleware/validation');
const Movement = require('./model');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');

const router = express.Router();
const scopeMovement = scopeResource(Movement, 'movementId');
router.use(passportConfig.isAuth, authenticateToken, requireCompanyScope);


const handleRequest = (req, res, promise) => {
  promise
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, err.message, 500, err));
};

router.post('/create', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), validateCashMovementCreate, (req, res) => {
  const movementData = {
    ...req.body,
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  handleRequest(req, res, controller.createMovement(movementData));
});


router.get('/summary/daily/:date', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const companyId = Helper.getCompanyId(req);
  handleRequest(req, res, controller.getDailySummary(req.params.date, companyId));
});


router.get('/user/:userId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { ...req.query, companyId: req.companyId };
  handleRequest(req, res, controller.getUserMovements(req.params.userId, filters));
});


router.get('/cashregister/:cashRegister', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { ...req.query, companyId: req.companyId };
  handleRequest(req, res, controller.getCashRegisterMovements(req.params.cashRegister, filters));
});


router.get('/daterange/:startDate/:endDate', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { startDate, endDate } = req.params;
  const companyId = Helper.getCompanyId(req);
  handleRequest(req, res, controller.getMovementsByDateRange(startDate, endDate, companyId));
});



router.get('/', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  handleRequest(req, res, controller.getMovements(filters));
});


router.put('/:movementId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), scopeMovement, validateCashMovementUpdate, (req, res) => {
  const updateData = {
    ...req.body,
    authorizedBy: Helper.getUserId(req)
  };
  handleRequest(req, res, controller.updateMovement(req.params.movementId, updateData));
});


router.delete('/:movementId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), scopeMovement, (req, res) => {
  handleRequest(req, res, controller.deleteMovement(req.params.movementId));
});


router.get('/:movementId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), scopeMovement, (req, res) => {
  handleRequest(req, res, controller.getMovementById(req.params.movementId));
});





module.exports = router;
