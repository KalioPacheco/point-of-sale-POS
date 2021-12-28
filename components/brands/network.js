const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');

const router = express.Router();

const addBrand = function (req, res) {
  const { brand } = req.body;
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
  const { brand } = req.body;
  controller
    .listBrands(brandId, brand)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateBrand = function (req, res) {
  const { brandId } = req.params;
  controller
    .updateBrand(brandId)
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

router.post('/', passportConfig.isAuth, addBrand);
router.get('/:brandId', passportConfig.isAuth, lisBrands);
router.patch('/:brandId', passportConfig.isAuth, updateBrand);
router.delete('/:brandId', passportConfig.isAuth, removeBrand);

module.exports = router;
