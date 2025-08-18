const express = require('express');
const controller = require('./controller');
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

router.post('/config', validateTax, async (req, res) => { 
  try {
    const taxData = {
      ...req.body,
      createdBy: req.user?.id
    };
    
    const result = await controller.addTaxConfig(taxData);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/config/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const result = await controller.listTaxConfigs(companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/config/detail/:taxConfigId', async (req, res) => {
  try {
    const { taxConfigId } = req.params;
    const result = await controller.getTaxConfig(taxConfigId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.put('/config/:taxConfigId', validateTax, async (req, res) => {
  try {
    const { taxConfigId } = req.params;
    const result = await controller.updateTaxConfig(taxConfigId, req.body);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.delete('/config/:taxConfigId', async (req, res) => {
  try {
    const { taxConfigId } = req.params;
    const result = await controller.removeTaxConfig(taxConfigId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});


router.post('/product', async (req, res) => {
  try {
    const { productId, taxConfigId, customRate, companyId } = req.body;
    const userId = req.user?.id;
    
    const result = await controller.setProductTax(productId, taxConfigId, customRate, companyId, userId);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.post('/product/bulk', async (req, res) => {
  try {
    const { productIds, taxConfigId, customRate, companyId } = req.body;
    const userId = req.user?.id;
    
    const result = await controller.bulkSetProductTaxes(productIds, taxConfigId, customRate, companyId, userId);
    sendResponse.success(req, res, result, 201);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/product/:productId/:companyId', async (req, res) => {
  try {
    const { productId, companyId } = req.params;
    const result = await controller.getProductTaxes(productId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/product/detail/:productId/:companyId', async (req, res) => {
  try {
    const { productId, companyId } = req.params;
    const result = await controller.getProductWithTaxes(productId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.delete('/product/:productId/:taxConfigId/:companyId', async (req, res) => {
  try {
    const { productId, taxConfigId, companyId } = req.params;
    const result = await controller.removeProductTax(productId, taxConfigId, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});


router.post('/calculate/product', async (req, res) => {
  try {
    const { productId, basePrice, companyId } = req.body;
    const result = await controller.calculateProductTaxes(productId, basePrice, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.post('/calculate/sale', async (req, res) => {
  try {
    const { products, companyId } = req.body;
    const result = await controller.calculateSaleTaxes(products, companyId);
    sendResponse.success(req, res, result);
  } catch (error) {
    sendResponse.error(req, res, error.message, 400);
  }
});

router.get('/test', (req, res) => {
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