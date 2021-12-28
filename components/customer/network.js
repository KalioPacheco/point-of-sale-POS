const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');

const router = express.Router();

const addCustomer = function (req, res) {
  const { customer } = req.body;
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
  controller
    .listCustomer(customerId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateCustomer = function (req, res) {
  const { customerId } = req.params;
  const { customer } = req.body;
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

router.post('/', passportConfig.isAuth, addCustomer);
router.get('/:customerId', passportConfig.isAuth, listCustomer);
router.patch('/:customerId', passportConfig.isAuth, updateCustomer);
router.delete('/:customerId', passportConfig.isAuth, removeCustomer);

module.exports = router;
