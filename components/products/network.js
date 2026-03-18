/* eslint-disable no-undef */
const express = require('express');
const mongoose = require('mongoose');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers'); 
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateProduct } = require('../../middleware/validation');


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
  const { q, category, disable } = req.query;

  const filters = {
    q: typeof q === 'string' ? q : undefined,
    category: typeof category === 'string' ? category : undefined,
    disable: disable === 'true' ? true : disable === 'false' ? false : undefined,
  };

  controller
    .listProducts(productId, companyId, filters)
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

  const finalReason =
  reason && reason.trim() !== ''
    ? reason
    : 'Manual adjustment';
    
  if (!quantity || quantity <= 0) {
    return response.error(req, res, 'Quantity must be positive', 400);
  }

  controller
    .addStock(productId, quantity, req.user.userId, finalReason)
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

  const finalReason =
  reason && reason.trim() !== ''
    ? reason
    : 'Manual adjustment';

  if (!quantity || quantity <= 0) {
    return response.error(req, res, 'Quantity must be positive', 400);
  }

  controller
    .reduceStock(productId, quantity, req.user.userId, finalReason)
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

  const finalReason =
  reason && reason.trim() !== ''
    ? reason
    : 'Manual adjustment';

  if (!quantity || quantity <= 0) {
    return response.error(req, res, 'Quantity must be positive', 400);
  }

  controller
    .addVariantStock(productId, variantId, quantity, req.user.userId, finalReason)
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

const checkCouponEligibility = function checkCouponEligibility(req, res) {
  const { productIds, couponId } = req.body;

  if (!productIds || !couponId) {
    return response.error(req, res, 'Product IDs and Coupon ID are required', 400);
  }

  controller
    .checkCouponEligibility(productIds, couponId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error checking coupon eligibility:', err);
      response.error(req, res, err.message || 'Error checking coupon eligibility', 500, err);
    });
  
  return undefined;
};

const calculatePriceWithCoupon = function calculatePriceWithCoupon(req, res) {
  const { productId, couponCode, quantity = 1 } = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!productId || !couponCode || !companyId) {
    return response.error(req, res, 'Product ID, coupon code, and company are required', 400);
  }

  controller
    .calculateProductPriceWithCoupon(productId, couponCode, companyId, quantity)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error calculating price with coupon:', err);
      response.error(req, res, err.message || 'Error calculating price with coupon', 500, err);
    });
  
  return undefined;
};

const getEligibleForCoupons = function getEligibleForCoupons(req, res) {
  const companyId = Helper.getCompanyId(req);
  const { productIds } = req.query;

  controller
    .getProductsEligibleForCoupons(
      companyId,
      productIds ? productIds.split(',') : null
    )
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error getting eligible products:', err);
      response.error(req, res, err.message || 'Error getting eligible products', 500, err);
    });
  
  return undefined;
};

const getProductsByCategories = function getProductsByCategories(req, res) {
  const { categoryIds } = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!categoryIds || !Array.isArray(categoryIds)) {
    return response.error(req, res, 'Category IDs array is required', 400);
  }

  controller
    .getProductsByCategories(categoryIds, companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      console.error('Error getting products by categories:', err);
      response.error(req, res, err.message || 'Error getting products by categories', 500, err);
    });
  
  return undefined;
};


router.get('/', passportConfig.isAuth,authenticateToken, requireRole(['vendedor', 'admin', 'manager']), listProducts);
router.post('/', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), validateProduct, addProduct); 
router.patch('/:productId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), validateProduct, updateProduct);
router.patch('/:productId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), updateProduct);
router.delete('/:productId', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), removeProduct);
router.put('/:productId/stock/add', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), addStock);
router.put('/:productId/stock/reduce', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), reduceStock);
router.put('/:productId/stock/set', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), setStock);
router.get('/:productId/stock/history', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), getStockHistory);
router.get('/:productId/stock', passportConfig.isAuth,authenticateToken, requireRole(['admin', 'manager']), getProductStock);
router.post('/:productId/variants', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), addVariant);
router.put('/:productId/variants/:variantId/stock/add', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), addVariantStock);
router.put('/:productId/variants/:variantId/disable', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), disableVariant);
router.put('/:productId/variants/:variantId/enable', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), enableVariant);
router.get('/reports/low-stock', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), getLowStockProducts);
router.post('/check-coupon-eligibility', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), checkCouponEligibility);
router.post('/calculate-price-with-coupon', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), calculatePriceWithCoupon);
router.get('/eligible-for-coupons', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), getEligibleForCoupons);
router.post('/by-categories', passportConfig.isAuth, authenticateToken, requireRole(['admin', 'manager']), getProductsByCategories);

module.exports = router;
