const express = require('express');
const controller = require('./controller');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole,
  requireTenant
} = require('../../middleware/auth');
const { validateTax } = require('../../middleware/validation');


const router = express.Router();

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

router.post('/config', validateTax, authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => { 
  try {
    const companyId = Helper.getCompanyId(req);
    const taxData = {
      ...req.body,
      company: companyId,
      createdBy: req.user?.id
    };
    
    const result = await controller.addTaxConfig(taxData);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/config/:companyId', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
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

router.get('/config/detail/:taxConfigId', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  try {
    const { taxConfigId } = req.params;
    const companyId = Helper.getCompanyId(req);
    const result = await controller.getTaxConfig(taxConfigId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.put('/config/:taxConfigId', validateTax, authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  try {
    const { taxConfigId } = req.params;
    const companyId = Helper.getCompanyId(req);
    const result = await controller.updateTaxConfig(taxConfigId, req.body, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.delete('/config/:taxConfigId', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
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
    const companyId = Helper.getCompanyId(req);
    const userId = req.user?.id;
    
    const result = await controller.setProductTax(productId, taxConfigId, customRate, companyId, userId);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.post('/product/bulk', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  try {
    const { productIds, taxConfigId, customRate } = req.body;
    const companyId = Helper.getCompanyId(req);
    const userId = req.user?.id;
    
    const result = await controller.bulkSetProductTaxes(productIds, taxConfigId, customRate, companyId, userId);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/product/:productId/:companyId', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
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

router.get('/product/detail/:productId/:companyId', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
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

router.delete('/product/:productId/:taxConfigId/:companyId', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
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
    const companyId = Helper.getCompanyId(req);
    const result = await controller.calculateProductTaxes(productId, basePrice, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.post('/calculate/sale', authenticateToken, requireTenant, requireRole(['admin']), async (req, res) => {
  try {
    const { products } = req.body;
    const companyId = Helper.getCompanyId(req);
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