const express = require('express');
const mongoose = require('mongoose');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');

const router = express.Router();

const addProduct = function addProduct(req, res) {
  const product = req.body;
  const companyId = Helper.getCompanyId(req);
  
  if (companyId !== 'default-company-id' && mongoose.Types.ObjectId.isValid(companyId)) {
    product.company = companyId;
  }
  
  controller
    .addProduct(product)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
  
  return undefined;
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
  
  return undefined;
};

const updateProduct = function updateProduct(req, res) {
  const product = req.body;
  const { productId } = req.params;
  const companyId = Helper.getCompanyId(req);
  
  // Solo agregar company si es un ObjectId válido
  if (companyId !== 'default-company-id' && mongoose.Types.ObjectId.isValid(companyId)) {
    product.company = companyId;
  }
  
  controller
    .updateProduct(productId, product)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
  
  return undefined;
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
  
  return undefined;
};

const addStock = function addStock(req, res) {
  const { productId } = req.params;
  const { quantity, reason } = req.body;

  if (!quantity || quantity <= 0) {
    return response.error(req, res, 'Quantity must be positive', 400);
  }

  controller
    .addStock(productId, quantity, reason || 'Manual adjustment')
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error adding stock:', err);
      response.error(req, res, err.message || 'Error adding stock', 500, err);
    });
  
  return undefined;
};

const reduceStock = function reduceStock(req, res) {
  const { productId } = req.params;
  const { quantity, reason } = req.body;

  if (!quantity || quantity <= 0) {
    return response.error(req, res, 'Quantity must be positive', 400);
  }

  controller
    .reduceStock(productId, quantity, reason || 'Manual adjustment')
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error reducing stock:', err);
      response.error(req, res, err.message || 'Error reducing stock', 500, err);
    });
  
  return undefined;
};

const setStock = function setStock(req, res) {
  const { productId } = req.params;
  const { quantity, reason } = req.body;

  if (quantity < 0) {
    return response.error(req, res, 'Quantity cannot be negative', 400);
  }

  controller
    .setStock(productId, quantity, reason || 'Stock adjustment')
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error setting stock:', err);
      response.error(req, res, err.message || 'Error setting stock', 500, err);
    });
  
  return undefined;
};

const getStockHistory = function getStockHistory(req, res) {
  const { productId } = req.params;

  controller
    .getStockHistory(productId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error getting stock history:', err);
      response.error(req, res, 'Error getting stock history', 500, err);
    });
  
  return undefined;
};

const getLowStockProducts = function getLowStockProducts(req, res) {
  const companyId = Helper.getCompanyId(req);
  const minStock = parseInt(req.query.minStock, 10) || 5;

  controller
    .getLowStockProducts(companyId, minStock)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error getting low stock products:', err);
      response.error(req, res, 'Error getting low stock products', 500, err);
    });
  
  return undefined;
};

const getProductStock = function getProductStock(req, res) {
  const { productId } = req.params;

  controller
    .getProductStock(productId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error getting product stock:', err);
      response.error(req, res, err.message || 'Error getting product stock', 500, err);
    });
  
  return undefined;
};


const addVariant = function addVariant(req, res) {
  const { productId } = req.params;
  const variantData = req.body;

  if (!variantData.name) {
    return response.error(req, res, 'Variant name is required', 400);
  }

  controller
    .addVariant(productId, variantData)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      console.error('Error adding variant:', err);
      response.error(req, res, err.message || 'Error adding variant', 500, err);
    });
  
  return undefined;
};

const addVariantStock = function addVariantStock(req, res) {
  const { productId, variantId } = req.params;
  const { quantity, reason } = req.body;

  if (!quantity || quantity <= 0) {
    return response.error(req, res, 'Quantity must be positive', 400);
  }

  controller
    .addVariantStock(productId, variantId, quantity, reason || 'Manual adjustment')
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error adding variant stock:', err);
      response.error(req, res, err.message || 'Error adding variant stock', 500, err);
    });
  
  return undefined;
};

const disableVariant = function disableVariant(req, res) {
  const { productId, variantId } = req.params;
  const { reason } = req.body;

  controller
    .disableVariant(productId, variantId, reason || 'Manual disable')
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error disabling variant:', err);
      response.error(req, res, err.message || 'Error disabling variant', 500, err);
    });
  
  return undefined;
};

const enableVariant = function enableVariant(req, res) {
  const { productId, variantId } = req.params;
  const { reason } = req.body;

  controller
    .enableVariant(productId, variantId, reason || 'Manual enable')
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error enabling variant:', err);
      response.error(req, res, err.message || 'Error enabling variant', 500, err);
    });
  
  return undefined;
};

router.post('/', passportConfig.isAuth, addProduct);
router.get('/', passportConfig.isAuth, listProducts);
router.get('/:productId', passportConfig.isAuth, listProducts);
router.patch('/:productId', passportConfig.isAuth, updateProduct);
router.delete('/:productId', passportConfig.isAuth, removeProduct);
router.put('/:productId/stock/add', passportConfig.isAuth, addStock);
router.put('/:productId/stock/reduce', passportConfig.isAuth, reduceStock);
router.put('/:productId/stock/set', passportConfig.isAuth, setStock);
router.get('/:productId/stock/history', passportConfig.isAuth, getStockHistory);
router.get('/:productId/stock', passportConfig.isAuth, getProductStock);
router.post('/:productId/variants', passportConfig.isAuth, addVariant);
router.put('/:productId/variants/:variantId/stock/add', passportConfig.isAuth, addVariantStock);
router.put('/:productId/variants/:variantId/disable', passportConfig.isAuth, disableVariant);
router.put('/:productId/variants/:variantId/enable', passportConfig.isAuth, enableVariant);
router.get('/reports/low-stock', passportConfig.isAuth, getLowStockProducts);

module.exports = router;