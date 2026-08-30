const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateBrandCreate, validateBrandUpdate } = require('../../middleware/validation');
const Brand = require('./model');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');
const scopeBrand = scopeResource(Brand, 'brandId');


const router = express.Router();

const addBrand = function addBrand(req, res) {
  const brand = req.body;
  const companyId = Helper.getCompanyId(req);
  brand.company = companyId;
  brand.createdBy = Helper.getUserId(req);
  controller
    .addBrand(brand)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const lisBrands = function lisBrands(req, res) {
  const { brandId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .listBrands(brandId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateBrand = function updateBrand(req, res) {
  const { brandId } = req.params;
  const brand = req.body;
  const companyId = Helper.getCompanyId(req);
  delete brand.companyId;
  delete brand.company;
  controller
    .updateBrand(brandId, brand, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeBrand = function removeBrand(req, res) {
  const { brandId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .removeBrand(brandId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};


router.get('/', authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), lisBrands);
router.get('/:brandId', authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), scopeBrand, lisBrands);
router.post('/', authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), validateBrandCreate, addBrand);
router.patch('/:brandId', authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), scopeBrand, validateBrandUpdate, updateBrand);
router.delete('/:brandId', authenticateToken, requireCompanyScope, requireRole(['admin', 'manager']), scopeBrand, removeBrand);

module.exports = router;
