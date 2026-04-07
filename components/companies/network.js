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

const resolveBusinessError = (err) => {
  const message = err && err.message ? err.message : '';

  if (/usuarios activos asignados/i.test(message)) {
    return { status: 409, message };
  }

  if (/Empresa no encontrada/i.test(message)) {
    return { status: 404, message };
  }

  return null;
};

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
  const { companyId } = req.params;
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
      const known = resolveBusinessError(err);
      if (known) {
        return response.error(req, res, known.message, known.status, err);
      }
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
      const known = resolveBusinessError(err);
      if (known) {
        return response.error(req, res, known.message, known.status, err);
      }
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth,authenticateToken, requireRole(['admin']), listCompanies);
router.get('/:companyId', passportConfig.isAuth,authenticateToken, requireRole(['admin']), listCompanies);
router.post('/', passportConfig.isAuth,authenticateToken, requireRole(['admin']), validateCompany, addCompany);
router.patch('/:companyId', passportConfig.isAuth,authenticateToken, requireRole(['admin']), validateCompany, updateCompany);
router.delete('/:companyId', passportConfig.isAuth,authenticateToken, requireRole(['admin']), removeCompany);


module.exports = router;
