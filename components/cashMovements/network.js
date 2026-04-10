const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateCashMovement } = require('../../middleware/validation');

const router = express.Router();


const handleRequest = (req, res, promise) => {
  promise
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, err.message, 500, err));
};

router.post('/create', authenticateToken, requireRole(['admin', 'manager']), validateCashMovement, (req, res) => {
  const movementData = {
    ...req.body,
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  handleRequest(req, res, controller.createMovement(movementData));
});


router.get('/summary/daily/:date', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const companyId = Helper.getCompanyId(req);
  handleRequest(req, res, controller.getDailySummary(req.params.date, companyId));
});


router.get('/user/:userId', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { ...req.query };
  handleRequest(req, res, controller.getUserMovements(req.params.userId, filters));
});


router.get('/cashregister/:cashRegister', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { ...req.query };
  handleRequest(req, res, controller.getCashRegisterMovements(req.params.cashRegister, filters));
});


router.get('/daterange/:startDate/:endDate', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { startDate, endDate } = req.params;
  const companyId = Helper.getCompanyId(req);
  handleRequest(req, res, controller.getMovementsByDateRange(startDate, endDate, companyId));
});



router.get('/', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  handleRequest(req, res, controller.getMovements(filters));
});


router.put('/:movementId', authenticateToken, requireRole(['admin', 'manager']), validateCashMovement, (req, res) => {
  const updateData = {
    ...req.body,
    authorizedBy: Helper.getUserId(req)
  };
  handleRequest(req, res, controller.updateMovement(req.params.movementId, updateData));
});


router.delete('/:movementId', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  handleRequest(req, res, controller.deleteMovement(req.params.movementId));
});


router.get('/:movementId', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  handleRequest(req, res, controller.getMovementById(req.params.movementId));
});





module.exports = router;
