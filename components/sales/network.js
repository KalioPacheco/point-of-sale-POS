/* eslint-disable no-undef */
/* eslint-disable consistent-return */
const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const { validateSale } = require('../../middleware/validation');

const router = express.Router();



const addSell = function addSell(req, res) {
  const sell = req.body;
  const companyId = Helper.getCompanyId(req);
  const idempotencyKey = req.headers['idempotency-key'];

  sell.companyId = companyId;

  if (!idempotencyKey) {
    return response.error(req, res, 'Idempotency-Key header required', 400);
  }

  controller
    .addSell(sell, idempotencyKey)
    .then(data => {
      response.success(req, res, {
        saleId: data.id,
        message: 'Venta creada correctamente'
      }, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listSales = function listSales(req, res) {
  const { sellId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .listSales(sellId, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateSell = function updateSell(req, res) {
  const { sellId } = req.params;
  const sell = req.body;
  const companyId = Helper.getCompanyId(req);
  sell.companyId = companyId;
  controller
    .updateSell(sellId, sell)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeSell = function removeSell(req, res) {
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


const validateCoupon = function validateCoupon(req, res) {
  const { couponCode, products, customerId } = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!couponCode || !products || !companyId) {
    return response.error(req, res, 'Faltan datos requeridos', 400);
  }

  controller
    .validateCouponForSale(couponCode, companyId, products, customerId)
    .then(data => {
      if (data.valid) {
        response.success(req, res, data, 200);
      } else {
        response.error(req, res, data.error, 400);
      }
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const addSellWithCoupon = function addSellWithCoupon(req, res) {
  const sell = req.body;
  const companyId = Helper.getCompanyId(req);
  const idempotencyKey = req.headers['idempotency-key'];

  sell.companyId = companyId;

  if (!idempotencyKey) {
    return response.error(req, res, 'Idempotency-Key header required', 400);
  }

  controller
    .addSell(sell, idempotencyKey)
    .then(data => {
      response.success(req, res, {
        saleId: data.id,
        message: 'Venta creada correctamente'
      }, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const previewSaleWithCoupon = function previewSaleWithCoupon(req, res) {
  const { products, couponCode, customerId } = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!products || !companyId) {
    return response.error(req, res, 'Products and company are required', 400);
  }

  const saleData = {
    products,
    couponCode,
    companyId,
    customerId
  };

  controller
    .processSaleWithCoupon(saleData)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth, listSales);            
router.get('/:sellId', passportConfig.isAuth, listSales);
router.post('/', passportConfig.isAuth, validateSale, addSell); 
router.patch('/:sellId', passportConfig.isAuth, validateSale, updateSell); 
router.delete('/:sellId', passportConfig.isAuth, removeSell);
router.post('/validate-coupon', passportConfig.isAuth, validateCoupon);
router.post('/with-coupon', passportConfig.isAuth, validateSale, addSellWithCoupon);
router.post('/preview-with-coupon', passportConfig.isAuth, previewSaleWithCoupon);
module.exports = router;