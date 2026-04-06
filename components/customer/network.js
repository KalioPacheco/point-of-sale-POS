const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole,
} = require('../../middleware/auth');
const { validateCustomer } = require('../../middleware/validation');

const router = express.Router();

const allowedRoles = ['admin', 'manager', 'vendedor'];

const addCustomer = function addCustomer(req, res) {
  const customer = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!companyId) {
    return response.error(req, res, 'Company ID is required', 400);
  }

  customer.company = companyId;
  customer.createdBy = Helper.getUserId(req);

  controller
    .addCustomer(customer)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });

  return undefined;
};

const listCustomers = function listCustomers(req, res) {
  const { customerId } = req.params;
  const companyId = Helper.getCompanyId(req);

  if (!companyId) {
    return response.error(req, res, 'Company ID is required', 400);
  }

  controller
    .listCustomer(customerId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });

  return undefined;
};

const updateCustomer = function updateCustomer(req, res) {
  const customer = req.body;
  const { customerId } = req.params;
  const companyId = Helper.getCompanyId(req);

  if (!companyId) {
    return response.error(req, res, 'Company ID is required', 400);
  }

  customer.company = companyId;

  controller
    .updateCustomer(customerId, customer, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, err.message || 'Internal error', 500, err);
    });

  return undefined;
};

const removeCustomer = function removeCustomer(req, res) {
  const { customerId } = req.params;
  const companyId = Helper.getCompanyId(req);

  if (!companyId) {
    return response.error(req, res, 'Company ID is required', 400);
  }

  controller
    .removeCustomer(customerId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, err.message || 'Internal error', 500, err);
    });

  return undefined;
};

router.get('/', passportConfig.isAuth, authenticateToken, requireRole(allowedRoles), listCustomers);
router.get('/:customerId', passportConfig.isAuth, authenticateToken, requireRole(allowedRoles), listCustomers);
router.post('/', passportConfig.isAuth, authenticateToken, requireRole(allowedRoles), validateCustomer, addCustomer);
router.patch('/:customerId', passportConfig.isAuth, authenticateToken, requireRole(allowedRoles), validateCustomer, updateCustomer);
router.delete('/:customerId', passportConfig.isAuth, authenticateToken, requireRole(allowedRoles), removeCustomer);

module.exports = router;
