const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateCompany } = require('../../middleware/validation');

const router = express.Router();

const addCompany = function (req, res) {
  const company = req.body;
  const scopeCompanyId = Helper.getCompanyId(req);
  if (!scopeCompanyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
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
  const { companyId } = req.params;
  const scopeCompanyId = Helper.getCompanyId(req);
  if (!scopeCompanyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  controller
    .listCompanies(companyId, scopeCompanyId)
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
  const scopeCompanyId = Helper.getCompanyId(req);
  if (!scopeCompanyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  controller
    .updateCompany(companyId, company, scopeCompanyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeCompany = function (req, res) {
  const { companyId } = req.params;
  const scopeCompanyId = Helper.getCompanyId(req);
  if (!scopeCompanyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  controller
    .removeCompany(companyId, scopeCompanyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth,authenticateToken, requireRole(['admin']), listCompanies);
router.get('/:companyId', passportConfig.isAuth,authenticateToken, requireRole(['admin']), listCompanies);
router.post('/', passportConfig.isAuth,authenticateToken, requireRole(['admin']), validateCompany, addCompany);
router.patch('/:companyId', passportConfig.isAuth,authenticateToken, requireRole(['admin']), validateCompany, updateCompany);
router.delete('/:companyId', passportConfig.isAuth,authenticateToken, requireRole(['admin']), removeCompany);


module.exports = router;
