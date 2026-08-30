const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateCategoryCreate, validateCategoryUpdate } = require('../../middleware/validation');
const Category = require('./model');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');
const scopeCategory = scopeResource(Category, 'categoryId');

const router = express.Router();

const addCategory = function (req, res) {
  const category = req.body;
  const companyId = Helper.getCompanyId(req);
  category.company = companyId;
  category.createdBy = Helper.getUserId(req);
  controller
    .addCategory(category)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listCategories = function (req, res) {
  const { categoryId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .listCategories(categoryId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateCategory = function (req, res) {
  const { categoryId } = req.params;
  const category = req.body;
  const companyId = Helper.getCompanyId(req);
  category.companyId = companyId;
  controller
    .updateCategory(categoryId, category)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeCategory = function (req, res) {
  const { categoryId } = req.params;
  controller
    .removeCategory(categoryId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['vendedor', 'admin', 'manager']), listCategories);
router.get('/:categoryId', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), scopeCategory, listCategories);
router.post('/', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), validateCategoryCreate, addCategory);
router.patch('/:categoryId', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), scopeCategory, validateCategoryUpdate, updateCategory);
router.delete('/:categoryId', passportConfig.isAuth,authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), scopeCategory, removeCategory);


module.exports = router;
