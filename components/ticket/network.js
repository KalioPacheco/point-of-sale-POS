const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const store = require('./store');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const { validateTicket } = require('../../middleware/validation');

const router = express.Router();



const handleRequest = (req, res, promise) => {
  promise
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, err.message || 'Internal error', 500, err));
};

const validateId = (field, message) => (req, res, next) => {
  const value = req.params[field] || req.body[field];
  if (!value) {
    return response.error(req, res, message || `${field} required`, 400);
  }
  return next();
};


router.get('/store-config', passportConfig.isAuth, (req, res) => {
  const companyId = Helper.getCompanyId(req);
  return handleRequest(req, res, controller.getStoreInfo(companyId));
});

router.put('/store-config', passportConfig.isAuth, (req, res) => {
  const storeInfo = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!storeInfo.name) {
    return response.error(req, res, 'Store name required', 400);
  }

  return handleRequest(req, res, controller.updateStoreInfo(storeInfo, companyId));
});



router.post('/calculate-taxes', passportConfig.isAuth, (req, res) => {
  const { items } = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!items || !Array.isArray(items) || items.length === 0) {
    return response.error(req, res, 'Items array is required and cannot be empty', 400);
  }

  return handleRequest(req, res, controller.calculateTicketTaxes(items, companyId));
});

router.get('/reports/taxes', passportConfig.isAuth, (req, res) => {
  const { startDate, endDate } = req.query;
  const companyId = Helper.getCompanyId(req);

  if (!startDate || !endDate) {
    return response.error(req, res, 'Start date and end date are required', 400);
  }

  return handleRequest(req, res, controller.getTaxReport(companyId, startDate, endDate));
});



router.post('/with-taxes', passportConfig.isAuth, (req, res) => {
  const ticketData = { 
    ...req.body, 
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  return handleRequest(req, res, controller.createTicketWithTaxes(ticketData));
});

router.post('/from-sale-with-taxes/:saleId?', passportConfig.isAuth, (req, res) => {
  const saleId = req.params.saleId || req.body.saleId;
  const userId = req.body.userId || Helper.getUserId(req);
  const companyId = req.body.companyId || Helper.getCompanyId(req);

  if (!saleId) {
    return response.error(req, res, 'Sale ID required', 400);
  }

  return handleRequest(req, res, controller.createTicketFromSaleWithTaxes(saleId, userId, companyId));
});

router.post('/process-sale-with-taxes', passportConfig.isAuth, (req, res) => {
  const saleData = req.body;
  const userId = Helper.getUserId(req);
  const companyId = Helper.getCompanyId(req);
  return handleRequest(req, res, controller.processSaleTicketWithTaxes(saleData, userId, companyId));
});



router.post('/with-coupon', passportConfig.isAuth, (req, res) => {
  const saleData = req.body;
  const ticketConfig = {
    cashierName: req.user?.name || 'Cajero',
    cashRegister: req.body.cashRegister || 'CAJA-1',
    storeName: req.body.storeName || 'Mi Tienda',
    storeAddress: req.body.storeAddress || '',
    storePhone: req.body.storePhone || '',
    storeTaxId: req.body.storeTaxId || '',
    storeEmail: req.body.storeEmail || ''
  };
  
  return handleRequest(req, res, controller.createTicketWithCoupon(saleData, ticketConfig));
});

router.post('/process-sale-with-coupon', passportConfig.isAuth, (req, res) => {
  const saleData = req.body;
  const userId = Helper.getUserId(req);
  const companyId = Helper.getCompanyId(req);
  
  return handleRequest(req, res, controller.processSaleTicketWithCoupon(saleData, userId, companyId));
});



router.post('/from-sale/:saleId?', passportConfig.isAuth, (req, res) => {
  const saleId = req.params.saleId || req.body.saleId;
  const userId = req.body.userId || Helper.getUserId(req);
  const companyId = req.body.companyId || Helper.getCompanyId(req);

  if (!saleId) {
    return response.error(req, res, 'Sale ID required', 400);
  }

  return handleRequest(req, res, controller.createTicketFromSale(saleId, userId, companyId));
});

router.post('/from-cut/:cutId?', passportConfig.isAuth, (req, res) => {
  const cutId = req.params.cutId || req.body.cutId;
  const userId = req.body.userId || Helper.getUserId(req);
  const companyId = req.body.companyId || Helper.getCompanyId(req);

  if (!cutId) {
    return response.error(req, res, 'Cut ID required', 400);
  }

  return handleRequest(req, res, controller.createTicketFromCut(cutId, userId, companyId));
});

router.post('/process-sale', passportConfig.isAuth, (req, res) => {
  const saleData = req.body;
  const userId = Helper.getUserId(req);
  const companyId = Helper.getCompanyId(req);
  return handleRequest(req, res, controller.processSaleTicket(saleData, userId, companyId));
});

router.post('/process-refund', passportConfig.isAuth, (req, res) => {
  const refundData = req.body;
  const userId = Helper.getUserId(req);
  const companyId = Helper.getCompanyId(req);
  return handleRequest(req, res, controller.processRefundTicket(refundData, userId, companyId));
});



router.get('/stats', passportConfig.isAuth, (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) 
  };
  return handleRequest(req, res, controller.getTicketStats(filters));
});



router.get('/:ticketId/data', passportConfig.isAuth, validateId('ticketId'), (req, res) => {
  const { ticketId } = req.params;
  return handleRequest(req, res, controller.generateTicketData(ticketId));
});

router.get('/:ticketId/pdf', passportConfig.isAuth, validateId('ticketId'), (req, res) => {
  const { ticketId } = req.params;
  const format = req.query.format || '80mm';

  if (!['58mm', '80mm'].includes(format)) {
    return response.error(req, res, 'Invalid format. Use: 58mm or 80mm', 400);
  }

  return store.generateTicketPDF(ticketId, format, res)
    .catch(err => {
      console.error('PDF error:', err);
      if (!res.headersSent) {
        return response.error(req, res, err.message || 'PDF error', 500);
      }
      return undefined;
    });
});

router.get('/:ticketId/receipt-with-coupon', passportConfig.isAuth, validateId('ticketId'), (req, res) => {
  const { ticketId } = req.params;
  
  return handleRequest(req, res, controller.generateTicketReceiptWithCoupon(ticketId));
});

router.get('/:ticketId/coupon-template', passportConfig.isAuth, validateId('ticketId'), (req, res) => {
  const { ticketId } = req.params;
  
  controller.getTicketById(ticketId)
    .then(ticket => {
      const template = controller.getCouponReceiptTemplate(ticket);
      response.success(req, res, { template }, 200);
    })
    .catch(err => response.error(req, res, err.message || 'Internal error', 500, err));
});



router.post('/:ticketId/reprint', passportConfig.isAuth, validateId('ticketId'), (req, res) => {
  const { ticketId } = req.params;
  const userId = Helper.getUserId(req);
  return handleRequest(req, res, controller.reprintTicket(ticketId, userId));
});

router.post('/:ticketId/cancel', passportConfig.isAuth, validateId('ticketId'), (req, res) => {
  const { ticketId } = req.params;
  const { reason } = req.body;
  const userId = Helper.getUserId(req);

  if (!reason) {
    return response.error(req, res, 'Reason required', 400);
  }

  return handleRequest(req, res, controller.cancelTicket(ticketId, reason, userId));
});

router.get('/:saleId', passportConfig.isAuth, validateId('saleId'), (req, res, next) => {
  const { saleId } = req.params;
  const format = req.query.format || '80mm';
  const wantsPdf = req.headers.accept?.includes('application/pdf');
  const hasFormatQuery = typeof req.query.format === 'string';

  if (!wantsPdf && !hasFormatQuery) {
    return next();
  }

  if (!['58mm', '80mm'].includes(format)) {
    return response.error(req, res, 'Invalid format. Use: 58mm or 80mm', 400);
  }

  return store.generateTicketPDFFromSale(
    saleId,
    format,
    res,
    Helper.getUserId(req),
    Helper.getCompanyId(req)
  ).catch(err => {
    console.error('Sale PDF error:', err);
    if (!res.headersSent) {
      return response.error(req, res, err.message || 'PDF error', 500);
    }
    return undefined;
  });
});



router.get('/:ticketId', passportConfig.isAuth, validateId('ticketId'), (req, res) => {
  const { ticketId } = req.params;
  return handleRequest(req, res, controller.getTicketById(ticketId));
});

router.post('/', passportConfig.isAuth, validateTicket, (req, res) => {
  const ticketData = { 
    ...req.body, 
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };
  return handleRequest(req, res, controller.createTicket(ticketData));
});

router.get('/', passportConfig.isAuth, (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) 
  };
  return handleRequest(req, res, controller.getTickets(filters));
});



router.get('/test/system', (req, res) => {
  response.success(req, res, {
    message: 'Ticket system working with tax integration and coupons',
    timestamp: new Date(),
    features: [
      'Create tickets from sales',
      'Generate PDF with phone/email',
      'Configure store info',
      'Multiple formats (58mm/80mm)',
      'Automatic tax calculation',
      'Tax breakdown reports',
      'Product-level tax rates',
      'Tax preview calculations',
      ' Coupon integration',
      ' Coupon receipts',
      ' Coupon templates'
    ]
  }, 200);
});

router.get('/system/config', passportConfig.isAuth, (req, res) => {
  const companyId = Helper.getCompanyId(req);

  response.success(req, res, {
    companyId,
    supportedFormats: ['58mm', '80mm'],
    supportedTicketTypes: ['sale', 'cashRegisterCut', 'refund', 'reprint'],
    pdfFeatures: {
      basicPdf: true,
      phoneAndEmail: true,
      multipleFormats: true,
      taxBreakdown: true 
    },
    taxFeatures: { 
      automaticCalculation: true,
      productLevelRates: true,
      multipleInvoiceTaxes: true,
      taxReports: true,
      previewCalculations: true
    },
    couponFeatures: { 
      couponIntegration: true,
      couponReceipts: true,
      couponTemplates: true,
      couponReports: true
    }
  }, 200);
});

router.post('/demo/sale-with-taxes', passportConfig.isAuth, (req, res) => {
  const companyId = Helper.getCompanyId(req);

  const demoSaleData = {
    ticketType: 'sale',
    items: [
      {
        productId: req.body.productId || '507f1f77bcf86cd799439013',
        productName: 'Producto ',
        quantity: 2,
        unitPrice: 100.00
      },
      {
        productId: req.body.productId2 || '507f1f77bcf86cd799439014',
        productName: 'Producto ',
        quantity: 1,
        unitPrice: 50.00
      }
    ],
    payment: {
      method: 'efectivo',
      details: {
        cashReceived: 300.00
      }
    },
    transactionInfo: {
      cashRegister: 'DEMO-CAJA',
      cashier: {
        id: Helper.getUserId(req),
        name: 'Demo Cashier'
      }
    },
    company: companyId
  };

  return handleRequest(req, res, controller.createTicketWithTaxes(demoSaleData));
});


router.post('/demo/sale-with-coupon', passportConfig.isAuth, (req, res) => {
  const companyId = Helper.getCompanyId(req);

  const demoSaleWithCoupon = {
    // eslint-disable-next-line prefer-template
    id: 'demo_sale_' + Date.now(),
    products: [
      {
        productId: req.body.productId || 'demo_product_1',
        quantity: 2,
        price: 50
      }
    ],
    subtotal: 100,
    totalTaxes: 0,
    total: 100,
    couponCode: req.body.couponCode || 'VALID2025',
    couponDiscount: req.body.couponDiscount || 20,
    couponId: req.body.couponId || '689c2446c60d57ee2d0e26e8',
    finalTotal: 80,
    paymentMethod: 'efectivo',
    cashReceived: 100,
    change: 20,
    company: companyId
  };

  return handleRequest(req, res, controller.createTicketWithCoupon(demoSaleWithCoupon, {
    storeName: 'Tienda Demo',
    cashierName: 'Demo Cashier'
  }));
});


module.exports = router;
