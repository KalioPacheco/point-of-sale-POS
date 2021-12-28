const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');

const router = express.Router();

const addProduct = function (req, res) {
  const { product } = req.body;
  controller
    .addProduct(product)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listProducts = function (req, res) {
  const { productId } = req.params;
  controller
    .listProducts(productId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateProduct = function (req, res) {
  const { product } = req.body;
  const { productId } = req.params;
  controller
    .updateProduct(productId, product)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeProduct = function (req, res) {
  const { productId } = req.params;
  controller
    .removeProduct(productId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.post('/', passportConfig.isAuth, addProduct);
router.get('/:productId', passportConfig.isAuth, listProducts);
router.patch('/:productId', passportConfig.isAuth, updateProduct);
router.delete('/:productId', passportConfig.isAuth, removeProduct);

module.exports = router;
