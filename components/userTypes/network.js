const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateUserTypeCreate, validateUserTypeUpdate } = require('../../middleware/validation');

const router = express.Router();

const addType = function (req, res) {
  const type = req.body;
  const companyId = Helper.getCompanyId(req);
  if (!companyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  const createdBy = Helper.getUserId(req);
  type.companyId = companyId;
  type.createdBy = createdBy;
  controller
    .addType(type)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listTypes = function (req, res) {
  const { typeId } = req.params;
  const companyId = Helper.getCompanyId(req);
  if (!companyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  controller
    .listTypes(typeId, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateType = function (req, res) {
  const { typeId } = req.params;
  const type = req.body;
  const companyId = Helper.getCompanyId(req);
  if (!companyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  type.companyId = companyId;
  controller
    .updateType(typeId, type, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeType = function (req, res) {
  const { typeId } = req.params;
  const companyId = Helper.getCompanyId(req);
  if (!companyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  controller
    .removeType(typeId, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth, authenticateToken, requireRole(['admin']), listTypes);
router.get('/:typeId', passportConfig.isAuth, authenticateToken, requireRole(['admin']), listTypes);
router.post('/', passportConfig.isAuth, authenticateToken, requireRole(['admin']), validateUserTypeCreate, addType);
router.patch('/:typeId', passportConfig.isAuth, authenticateToken, requireRole(['admin']), validateUserTypeUpdate, updateType);
router.delete('/:typeId', passportConfig.isAuth, authenticateToken, requireRole(['admin']), removeType);

module.exports = router;
