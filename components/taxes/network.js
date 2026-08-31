const express = require('express');
const controller = require('./controller');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole,
  requireTenant
} = require('../../middleware/auth');
const { validateTaxCreate, validateTaxUpdate } = require('../../middleware/validation');
const { TaxConfig } = require('./model');
const { Product } = require('../products/model');
const { requireCompanyScope, scopeResource, requireTenantParam } = require('../../middleware/tenant');


const router = express.Router();
const scopeTax = scopeResource(TaxConfig, 'taxConfigId');
const scopeProduct = scopeResource(Product, 'productId');
router.use(authenticateToken, requireCompanyScope);

const sendResponse = {
  success: (req, res, data, status = 200) => {
    res.status(status).json({
      error: false,
      status,
      body: data
    });
  },
  error: (req, res, message, status = 400) => {
    res.status(status).json({
      error: true,
      status,
      body: message
    });
  }
};

router.post('/config', validateTaxCreate, authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const taxData = {
      ...req.body,
      company: req.companyId,
      createdBy: req.user?._id || req.user?.id
    };
    
    const result = await controller.addTaxConfig(taxData);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/config/:companyId', authenticateToken, requireRole(['admin']), requireTenantParam('companyId'), async (req, res) => {
  try {
    const { companyId: pathCompanyId } = req.params;
    const companyId = Helper.getCompanyId(req);
    if (pathCompanyId && pathCompanyId !== companyId) {
      return sendResponse.error(req, res, 'Cross-tenant access denied', 403);
    }
    const result = await controller.listTaxConfigs(companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/config/detail/:taxConfigId', authenticateToken, requireRole(['admin']), scopeTax, async (req, res) => {
  try {
    const { taxConfigId } = req.params;
    const companyId = Helper.getCompanyId(req);
    const result = await controller.getTaxConfig(taxConfigId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.put('/config/:taxConfigId', validateTaxUpdate, authenticateToken, requireRole(['admin']), scopeTax, async (req, res) => {
  try {
    const { taxConfigId } = req.params;
    const companyId = Helper.getCompanyId(req);
    const result = await controller.updateTaxConfig(taxConfigId, req.body, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.delete('/config/:taxConfigId', authenticateToken, requireRole(['admin']), scopeTax, async (req, res) => {
  try {
    const { taxConfigId } = req.params;
    const companyId = Helper.getCompanyId(req);
    const result = await controller.removeTaxConfig(taxConfigId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});


router.post('/product', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  try {
    const { productId, taxConfigId, customRate } = req.body;
    const companyId = req.companyId;
    const userId = req.user?._id || req.user?.id;
    
    const result = await controller.setProductTax(productId, taxConfigId, customRate, companyId, userId);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.post('/product/bulk', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  try {
    const { productIds, taxConfigId, customRate } = req.body;
    const companyId = req.companyId;
    const userId = req.user?._id || req.user?.id;
    
    const result = await controller.bulkSetProductTaxes(productIds, taxConfigId, customRate, companyId, userId);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/product/:productId/:companyId', authenticateToken, requireRole(['admin']), requireTenantParam('companyId'), scopeProduct, async (req, res) => {
  try {
    const { productId, companyId: pathCompanyId } = req.params;
    const companyId = Helper.getCompanyId(req);
    if (pathCompanyId && pathCompanyId !== companyId) {
      return sendResponse.error(req, res, 'Cross-tenant access denied', 403);
    }
    const result = await controller.getProductTaxes(productId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/product/detail/:productId/:companyId', authenticateToken, requireRole(['admin']), requireTenantParam('companyId'), scopeProduct, async (req, res) => {
  try {
    const { productId, companyId: pathCompanyId } = req.params;
    const companyId = Helper.getCompanyId(req);
    if (pathCompanyId && pathCompanyId !== companyId) {
      return sendResponse.error(req, res, 'Cross-tenant access denied', 403);
    }
    const result = await controller.getProductWithTaxes(productId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.delete('/product/:productId/:taxConfigId/:companyId', authenticateToken, requireRole(['admin']), requireTenantParam('companyId'), scopeProduct, scopeTax, async (req, res) => {
  try {
    const { productId, taxConfigId, companyId: pathCompanyId } = req.params;
    const companyId = Helper.getCompanyId(req);
    if (pathCompanyId && pathCompanyId !== companyId) {
      return sendResponse.error(req, res, 'Cross-tenant access denied', 403);
    }
    const result = await controller.removeProductTax(productId, taxConfigId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});


router.post('/calculate/product', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  try {
    const { productId, basePrice } = req.body;
    const companyId = req.companyId;
    const result = await controller.calculateProductTaxes(productId, basePrice, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.post('/calculate/sale', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  try {
    const { products } = req.body;
    const companyId = req.companyId;
    const result = await controller.calculateSaleTaxes(products, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/test', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  sendResponse.success(req, res, {
    message: 'Tax system is working correctly',
    timestamp: new Date(),
    endpoints: [
      'POST /taxes/config - Create tax configuration',
      'GET /taxes/config/:companyId - List tax configurations',
      'POST /taxes/product - Set product tax',
      'POST /taxes/calculate/sale - Calculate sale taxes'
    ]
  });
});
module.exports = router;
