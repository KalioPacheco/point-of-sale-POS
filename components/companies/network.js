const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateCompanyCreate, validateCompanyUpdate } = require('../../middleware/validation');
const { requireCompanyScope, requireTenantParam } = require('../../middleware/tenant');

const router = express.Router();

const addCompany = function (req, res) {
  const company = req.body;
  company.createdBy = Helper.getUserId(req);
  controller
    .addCompany(company)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listCompanies = function (req, res) {
  const companyId = req.params.companyId || Helper.getCompanyId(req);
  controller
    .listCompanies(companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateCompany = function (req, res) {
  const { companyId } = req.params;
  const company = req.body;
  controller
    .updateCompany(companyId, company)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeCompany = function (req, res) {
  const { companyId } = req.params;
  controller
    .removeCompany(companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin']), listCompanies);
router.get('/:companyId', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin']), requireTenantParam('companyId'), listCompanies);
router.post('/', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin']), validateCompanyCreate, addCompany);
router.patch('/:companyId', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin']), requireTenantParam('companyId'), validateCompanyUpdate, updateCompany);
router.delete('/:companyId', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin']), requireTenantParam('companyId'), removeCompany);


module.exports = router;
