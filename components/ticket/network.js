const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const store = require('./store');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const Ticket = require('./model');
const Sale = require('../sales/model');
const Cut = require('../cashRegisterCuts/model');
const { requireCompanyScope, scopeResource } = require('../../middleware/tenant');
const { requireScopedBranchAccess, assignedBranchIds, isAdmin } = require('../../middleware/branch');

const router = express.Router();
const scopeTicket = scopeResource(Ticket, 'ticketId');
const scopeSale = scopeResource(Sale, 'saleId');
const scopeRefundSale = scopeResource(Sale, 'originalSaleId');
const scopeCut = scopeResource(Cut, 'cutId');
router.use(authenticateToken, requireCompanyScope);



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

const legacyTicketCreationDisabled = (req, res) => response.error(
  req,
  res,
  'Manual ticket creation is disabled; use sale, refund or cash cut flows',
  410
);

const requireOwnSaleForSeller = (req, res, next) => {
  if (req.user.role !== 'vendedor') return next();
  if (String(req.scopedResource?.createdBy) !== String(Helper.getUserId(req))) {
    return response.error(req, res, 'Sale not found', 404);
  }
  return next();
};

const requireOwnTicketForSeller = (req, res, next) => {
  if (req.user.role !== 'vendedor') return next();
  const cashierId = req.scopedResource?.transactionInfo?.cashier?.id;
  if (String(cashierId) !== String(Helper.getUserId(req))) {
    return response.error(req, res, 'Ticket not found', 404);
  }
  return next();
};


router.get('/store-config', authenticateToken, (req, res) => {
  const companyId = Helper.getCompanyId(req);
  return handleRequest(req, res, controller.getStoreInfo(companyId));
});

router.put('/store-config', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const storeInfo = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!companyId || companyId === 'default-company-id') {
    return response.error(req, res, 'Company scope required to persist store-config', 400);
  }

  if (!storeInfo.name) {
    return response.error(req, res, 'Store name required', 400);
  }

  if (storeInfo.address !== undefined && typeof storeInfo.address !== 'string') {
    return response.error(req, res, 'Store address must be a string', 400);
  }

  return handleRequest(req, res, controller.updateStoreInfo(storeInfo, companyId));
});



router.post('/calculate-taxes', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { items } = req.body;
  const companyId = Helper.getCompanyId(req);

  if (!items || !Array.isArray(items) || items.length === 0) {
    return response.error(req, res, 'Items array is required and cannot be empty', 400);
  }

  return handleRequest(req, res, controller.calculateTicketTaxes(items, companyId));
});

router.get('/reports/taxes', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const { startDate, endDate } = req.query;
  const companyId = Helper.getCompanyId(req);

  if (!startDate || !endDate) {
    return response.error(req, res, 'Start date and end date are required', 400);
  }

  return handleRequest(req, res, controller.getTaxReport(companyId, startDate, endDate, isAdmin(req.user) ? undefined : assignedBranchIds(req.user)));
});



router.post('/with-taxes', legacyTicketCreationDisabled);

router.post('/from-sale-with-taxes/:saleId?', legacyTicketCreationDisabled);

router.post('/process-sale-with-taxes', legacyTicketCreationDisabled);



router.post('/with-coupon', legacyTicketCreationDisabled);

router.post('/process-sale-with-coupon', legacyTicketCreationDisabled);



router.post('/from-sale/:saleId?', legacyTicketCreationDisabled);

router.post('/from-cut/:cutId?', requireRole(['admin', 'manager']), scopeCut, requireScopedBranchAccess(), (req, res) => {
  const cutId = req.params.cutId || req.body.cutId;
  const userId = Helper.getUserId(req);
  const companyId = Helper.getCompanyId(req);

  if (!cutId) {
    return response.error(req, res, 'Cut ID required', 400);
  }

  return handleRequest(req, res, controller.createTicketFromCut(cutId, userId, companyId));
});

router.post('/process-sale', legacyTicketCreationDisabled);

router.post('/process-refund', authenticateToken, requireRole(['admin', 'manager']), scopeRefundSale, requireScopedBranchAccess(), (req, res) => {
  const refundData = req.body;
  const userId = Helper.getUserId(req);
  const companyId = Helper.getCompanyId(req);
  return handleRequest(req, res, controller.processRefundTicket(refundData, userId, companyId));
});



router.get('/stats', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req),
    branchIds: isAdmin(req.user) ? undefined : assignedBranchIds(req.user)
  };
  return handleRequest(req, res, controller.getTicketStats(filters));
});



router.get('/:ticketId/data', authenticateToken, validateId('ticketId'), scopeTicket, requireScopedBranchAccess('scopedResource', 'transactionInfo.branch'), requireOwnTicketForSeller, (req, res) => {
  const { ticketId } = req.params;
  return handleRequest(req, res, controller.generateTicketData(ticketId));
});

router.get('/:ticketId/pdf', authenticateToken, validateId('ticketId'), scopeTicket, requireScopedBranchAccess('scopedResource', 'transactionInfo.branch'), requireOwnTicketForSeller, (req, res) => {
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

router.get('/:ticketId/receipt-with-coupon', authenticateToken, validateId('ticketId'), scopeTicket, requireScopedBranchAccess('scopedResource', 'transactionInfo.branch'), requireOwnTicketForSeller, (req, res) => {
  const { ticketId } = req.params;
  
  return handleRequest(req, res, controller.generateTicketReceiptWithCoupon(ticketId));
});

router.get('/:ticketId/coupon-template', authenticateToken, validateId('ticketId'), scopeTicket, requireScopedBranchAccess('scopedResource', 'transactionInfo.branch'), requireOwnTicketForSeller, (req, res) => {
  const { ticketId } = req.params;
  
  controller.getTicketById(ticketId)
    .then(ticket => {
      const template = controller.getCouponReceiptTemplate(ticket);
      response.success(req, res, { template }, 200);
    })
    .catch(err => response.error(req, res, err.message || 'Internal error', 500, err));
});



router.post('/:ticketId/reprint', authenticateToken, validateId('ticketId'), scopeTicket, requireScopedBranchAccess('scopedResource', 'transactionInfo.branch'), requireOwnTicketForSeller, (req, res) => {
  const { ticketId } = req.params;
  const userId = Helper.getUserId(req);
  return handleRequest(req, res, controller.reprintTicket(ticketId, userId));
});

router.post('/:ticketId/cancel', authenticateToken, requireRole(['admin', 'manager']), validateId('ticketId'), scopeTicket, requireScopedBranchAccess('scopedResource', 'transactionInfo.branch'), (req, res) => {
  const { ticketId } = req.params;
  const { reason } = req.body;
  const userId = Helper.getUserId(req);

  if (!reason) {
    return response.error(req, res, 'Reason required', 400);
  }

  return handleRequest(req, res, controller.cancelTicket(
    ticketId,
    reason,
    userId,
    Helper.getCompanyId(req)
  ));
});

router.get('/:saleId', authenticateToken, validateId('saleId'), (req, res, next) => {
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

  return scopeSale(req, res, () => requireScopedBranchAccess()(req, res, () => requireOwnSaleForSeller(req, res, () => store.generateTicketPDFFromSale(
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
    }))));
});



router.get('/:ticketId', authenticateToken, validateId('ticketId'), scopeTicket, requireScopedBranchAccess('scopedResource', 'transactionInfo.branch'), requireOwnTicketForSeller, (req, res) => {
  const { ticketId } = req.params;
  return handleRequest(req, res, controller.getTicketById(ticketId));
});

router.post('/', legacyTicketCreationDisabled);

router.get('/', authenticateToken, requireRole(['admin', 'manager']), (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req),
    branchIds: isAdmin(req.user) ? undefined : assignedBranchIds(req.user)
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

router.get('/system/config', authenticateToken, (req, res) => {
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

router.post('/demo/sale-with-taxes', legacyTicketCreationDisabled, (req, res) => {
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


router.post('/demo/sale-with-coupon', legacyTicketCreationDisabled, (req, res) => {
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
