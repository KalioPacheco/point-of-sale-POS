const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');

const router = express.Router();

const addProduct = function addProduct(req, res) {
  const product = req.body;
  const companyId = Helper.getCompanyId(req);
  product.company = companyId;
  controller
    .addProduct(product)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listProducts = function listProducts(req, res) {
  const { productId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .listProducts(productId, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateProduct = function updateProduct(req, res) {
  const product = req.body;
  const { productId } = req.params;
  const companyId = Helper.getCompanyId(req);
  product.company = companyId;
  controller
    .updateProduct(productId, product)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeProduct = function removeProduct(req, res) {
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

const addPiecesToProduct = function addPiecesToProduct(req, res) {

  const { productId } = req.params;
  const { quantity, reason } = req.body;
  const addedBy = Helper.getUserId(req);
  const companyId = Helper.getCompanyId(req);
  

  if (!quantity || !reason) {
    response.error(req, res, 'Quantity and reason are required', 400);
    return;
  }
  
  const piecesData = {
    quantity: parseInt(quantity, 10),
    reason,
    addedBy,
    companyId
  };
  
  controller
    .addPiecesToProduct(productId, piecesData)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const getStockHistory = function getStockHistory(req, res) {

  const { productId } = req.params;
    
  controller
    .getStockHistory(productId)
    .then(history => {
      response.success(req, res, history, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};



const addVariant = function addVariant(req, res) {

  const { productId } = req.params;
  const variantData = req.body;
  const userId = Helper.getUserId(req);
  variantData.createdBy = userId;
  
  if (!variantData.name || !variantData.value) {
    response.error(req, res, 'Name and value are required for variant', 400);
    return;
  }
  
  controller
    .addVariant(productId, variantData)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listVariants = function listVariants(req, res) {
 
  const { productId } = req.params;
  
  controller
    .listVariants(productId)
    .then(variants => {
      response.success(req, res, variants, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateVariant = function updateVariant(req, res) {
 
  const { productId, variantId } = req.params;
  const variantData = req.body;
  variantData.updatedAt = new Date();
  
  controller
    .updateVariant(productId, variantId, variantData)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeVariant = function removeVariant(req, res) {
  const { productId, variantId } = req.params;
  
  controller
    .removeVariant(productId, variantId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const addStockToVariant = function addStockToVariant(req, res) {
 
  const { productId, variantId } = req.params;
  const { quantity, reason } = req.body;
  const addedBy = Helper.getUserId(req);
  
  if (!quantity || !reason) {
    response.error(req, res, 'Quantity and reason are required', 400);
    return;
  }
  
  const stockData = {
    quantity: parseInt(quantity, 10),
    reason,
    addedBy
  };
  
  controller
    .addStockToVariant(productId, variantId, stockData)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const getVariantStockHistory = function getVariantStockHistory(req, res) {
  
  const { productId, variantId } = req.params;
  
  controller
    .getVariantStockHistory(productId, variantId)
    .then(history => {
      response.success(req, res, history, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.post('/', passportConfig.isAuth, addProduct);
router.get('/', passportConfig.isAuth, listProducts);
router.get('/:productId', passportConfig.isAuth, listProducts);
router.patch('/:productId', passportConfig.isAuth, updateProduct);
router.delete('/:productId', passportConfig.isAuth, removeProduct);
router.put('/:productId/add-pieces', passportConfig.isAuth, addPiecesToProduct);    
router.get('/:productId/stock-history', passportConfig.isAuth, getStockHistory);  
router.post('/:productId/variants', passportConfig.isAuth, addVariant);                                  
router.get('/:productId/variants', passportConfig.isAuth, listVariants);                                   
router.patch('/:productId/variants/:variantId', passportConfig.isAuth, updateVariant);                     
router.delete('/:productId/variants/:variantId', passportConfig.isAuth, removeVariant);                   
router.put('/:productId/variants/:variantId/add-stock', passportConfig.isAuth, addStockToVariant);         
router.get('/:productId/variants/:variantId/stock-history', passportConfig.isAuth, getVariantStockHistory);

module.exports = router;