const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateCompanyCreate, validateCompanyUpdate } = require('../../middleware/validation');
const { requireCompanyScope, requireTenantParam } = require('../../middleware/tenant');

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
  const tokenCompanyId = Helper.getCompanyId(req);

  if (companyId && tokenCompanyId && companyId !== tokenCompanyId) {
    return response.error(req, res, 'Cross-tenant access denied', 403);
  }

  controller
    .listCompanies(tokenCompanyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateCompany = function (req, res) {
  const { companyId } = req.params;
  const tokenCompanyId = Helper.getCompanyId(req);
  const company = req.body;

  if (companyId && tokenCompanyId && companyId !== tokenCompanyId) {
    return response.error(req, res, 'Cross-tenant access denied', 403);
  }

  controller
    .updateCompany(tokenCompanyId, company)
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
  const tokenCompanyId = Helper.getCompanyId(req);

  if (companyId && tokenCompanyId && companyId !== tokenCompanyId) {
    return response.error(req, res, 'Cross-tenant access denied', 403);
  }

  controller
    .removeCompany(tokenCompanyId)
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

router.get('/', authenticateToken, requireCompanyScope, requireRole(['admin']), listCompanies);
router.get('/:companyId', authenticateToken, requireCompanyScope, requireRole(['admin']), requireTenantParam('companyId'), listCompanies);
router.post('/', authenticateToken, requireCompanyScope, requireRole(['admin']), validateCompanyCreate, addCompany);
router.patch('/:companyId', authenticateToken, requireCompanyScope, requireRole(['admin']), requireTenantParam('companyId'), validateCompanyUpdate, updateCompany);
router.delete('/:companyId', authenticateToken, requireCompanyScope, requireRole(['admin']), requireTenantParam('companyId'), removeCompany);


module.exports = router;
