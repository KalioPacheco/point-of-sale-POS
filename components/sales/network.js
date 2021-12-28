const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');

const router = express.Router();

const addSell = function (req, res) {
  const { sell } = req.body;
  controller
    .addSell(sell)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listSales = function (req, res) {
  const { sellId } = req.params;
  controller
    .listSales(sellId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateSell = function (req, res) {
  const { sellId } = req.params;
  const { sell } = req.body;
  controller
    .updateSell(sellId, sell)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeSell = function (req, res) {
  const { sellId } = req.params;
  controller
    .removeSell(sellId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.post('/', passportConfig.isAuth, addSell);
router.get('/:sellId', passportConfig.isAuth, listSales);
router.patch('/:sellId', passportConfig.isAuth, updateSell);
router.delete('/:sellId', passportConfig.isAuth, removeSell);

module.exports = router;
