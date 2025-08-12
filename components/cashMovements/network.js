const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');

const router = express.Router();


const handleRequest = (req, res, promise) => {
  promise
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, err.message, 500, err));
};

// Crear movimiento
router.post('/create', passportConfig.isAuth, (req, res) => {
  const movementData = {
    ...req.body,
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  handleRequest(req, res, controller.createMovement(movementData));
});


// Resumen diario
router.get('/summary/daily/:date', passportConfig.isAuth, (req, res) => {
  const companyId = Helper.getCompanyId(req);
  handleRequest(req, res, controller.getDailySummary(req.params.date, companyId));
});

// Movimientos por usuario
router.get('/user/:userId', passportConfig.isAuth, (req, res) => {
  const filters = { ...req.query };
  handleRequest(req, res, controller.getUserMovements(req.params.userId, filters));
});

// Movimientos por caja registradora
router.get('/cashregister/:cashRegister', passportConfig.isAuth, (req, res) => {
  const filters = { ...req.query };
  handleRequest(req, res, controller.getCashRegisterMovements(req.params.cashRegister, filters));
});

// Movimientos por rango de fechas
router.get('/daterange/:startDate/:endDate', passportConfig.isAuth, (req, res) => {
  const { startDate, endDate } = req.params;
  const companyId = Helper.getCompanyId(req);
  handleRequest(req, res, controller.getMovementsByDateRange(startDate, endDate, companyId));
});


// Listar movimientos con filtros
router.get('/', passportConfig.isAuth, (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  handleRequest(req, res, controller.getMovements(filters));
});

// Actualizar movimiento
router.put('/:movementId', passportConfig.isAuth, (req, res) => {
  const updateData = {
    ...req.body,
    authorizedBy: Helper.getUserId(req)
  };
  handleRequest(req, res, controller.updateMovement(req.params.movementId, updateData));
});

// Eliminar movimiento 
router.delete('/:movementId', passportConfig.isAuth, (req, res) => {
  handleRequest(req, res, controller.deleteMovement(req.params.movementId));
});

// Obtener movimiento por id
router.get('/:movementId', passportConfig.isAuth, (req, res) => {
  handleRequest(req, res, controller.getMovementById(req.params.movementId));
});

module.exports = router;