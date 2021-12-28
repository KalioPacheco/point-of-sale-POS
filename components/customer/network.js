const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');

const router = express.Router();

const addCustomer = function (req, res) {
  const customer = req.body;
  const companyId = Helper.getCompanyId(req);
  customer.companyId = companyId;
  controller
    .addCustomer(customer)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listCustomer = function (req, res) {
  const { customerId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .listCustomer(customerId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateCustomer = function (req, res) {
  const { customerId } = req.params;
  const customer = req.body;
  const companyId = Helper.getCompanyId(req);
  customer.companyId = companyId;
  controller
    .updateCustomer(customerId, customer)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeCustomer = function (req, res) {
  const { customerId } = req.params;
  controller
    .removeCustomer(customerId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth, listCustomer);
router.get('/:customerId', passportConfig.isAuth, listCustomer);
router.post('/', passportConfig.isAuth, addCustomer);
router.patch('/:customerId', passportConfig.isAuth, updateCustomer);
router.delete('/:customerId', passportConfig.isAuth, removeCustomer);

module.exports = router;
