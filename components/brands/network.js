const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');

const router = express.Router();

// middleware that is specific to this router
// router.use((req, res, next) => {
//   console.log('Time: ', Date.now());
//   next();
// });

const addBrand = function (req, res) {
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

const lisBrands = function (req, res) {
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

const updateBrand = function (req, res) {
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

const removeBrand = function (req, res) {
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

router.get('/', passportConfig.isAuth, lisBrands);
router.get('/:brandId', passportConfig.isAuth, lisBrands);
router.post('/', passportConfig.isAuth, addBrand);
router.patch('/:brandId', passportConfig.isAuth, updateBrand);
router.delete('/:brandId', passportConfig.isAuth, removeBrand);

module.exports = router;
