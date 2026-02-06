const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateBrand } = require('../../middleware/validation');


const router = express.Router();

const addBrand = function addBrand(req, res) {
  const brand = req.body;
  const companyId = Helper.getCompanyId(req);
  brand.companyId = companyId;
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
  brand.companyId = companyId;
  controller
    .updateBrand(brandId, brand)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeBrand = function removeBrand(req, res) {
  const { brandId } = req.params;
  controller
    .removeBrand(brandId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};


router.get('/', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), lisBrands);
router.get('/:brandId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), lisBrands);
router.post('/', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), validateBrand, addBrand);
router.patch('/:brandId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), validateBrand, updateBrand);
router.delete('/:brandId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), removeBrand);

module.exports = router;