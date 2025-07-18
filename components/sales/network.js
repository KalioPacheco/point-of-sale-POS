const express = require('express');
const mongoose = require('mongoose');
const response = require('../../network');
const controller = require('./controller');
const store = require('./store'); 
const passportConfig = require('../../passport');
const Helper = require('../../helpers');

const router = express.Router();

const addSell = function addSell(req, res) {
  const sell = req.body;
  const companyId = Helper.getCompanyId(req);
  sell.companyId = companyId;
  controller
    .addSell(sell)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listSales = function listSales(req, res) {
  const { sellId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .listSales(sellId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateSell = function updateSell(req, res) {
  const { sellId } = req.params;
  const sell = req.body;
  const companyId = Helper.getCompanyId(req);
  sell.companyId = companyId;
  controller
    .updateSell(sellId, sell)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeSell = function removeSell(req, res) {
  const { sellId } = req.params;
  controller
    .removeSell(sellId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const createSalePOS = function createSalePOS(req, res) {
  const saleData = req.body;
  const companyId = Helper.getCompanyId(req);
  const userId = Helper.getUserId(req);

  saleData.userId = userId;
  if (companyId !== 'default-company-id' && mongoose.Types.ObjectId.isValid(companyId)) {
    saleData.companyId = companyId;
  }

  if (req.user && req.user.userName) {
    saleData.cashierName = req.user.userName;
  }

  console.log('Creating POS sale with data:', {
    cashRegister: saleData.cashRegister,
    itemCount: saleData.items?.length,
    paymentMethod: saleData.paymentMethod,
    userId,
    companyId
  });

  controller
    .createSalePOS(saleData)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      console.error('Error creating POS sale:', err);
      response.error(req, res, err.message || 'Error creating sale', 500, err);
    });
  
  return undefined;
};

const generateTicketPOS = function generateTicketPOS(req, res) {
  const { saleId } = req.params;

  controller
    .generateTicketPOS(saleId)
    .then(ticket => {
      response.success(req, res, ticket, 200);
    })
    .catch(err => {
      console.error(' Error generating ticket:', err);
      response.error(req, res, err.message || 'Error generating ticket', 500, err);
    });
  
  return undefined;
};

const generateTicketPDF = function generateTicketPDF(req, res) {
  const { saleId } = req.params;

  store.generateTicketPDF(saleId, res) 
    .catch(err => {
      console.error(' Error generating ticket PDF:', err);
      response.error(req, res, err.message || 'Error generating ticket PDF', 500, err);
    });
  
  return undefined;
};

router.get('/', passportConfig.isAuth, listSales);
router.get('/:sellId', passportConfig.isAuth, listSales);
router.post('/', passportConfig.isAuth, addSell);
router.patch('/:sellId', passportConfig.isAuth, updateSell);
router.delete('/:sellId', passportConfig.isAuth, removeSell);
router.post('/pos/create', passportConfig.isAuth, createSalePOS);
router.get('/pos/:saleId/ticket', passportConfig.isAuth, generateTicketPOS);
router.get('/pos/:saleId/ticket/pdf', passportConfig.isAuth, generateTicketPDF);
module.exports = router;