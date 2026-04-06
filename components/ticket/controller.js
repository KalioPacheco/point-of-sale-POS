/* eslint-disable no-undef */
/* eslint-disable no-use-before-define */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const store = require('./store');
const taxController = require('../taxes/controller'); 


const validateTicketData = (ticketData) => {
  const errors = [];
  
  if (!ticketData.ticketType) errors.push('Ticket type required');
  if (!ticketData.totals?.total && ticketData.ticketType === 'sale') errors.push('Total amount required for sales');
  if (!ticketData.payment?.method) errors.push('Payment method required');
  
  const validTypes = ['sale', 'cashRegisterCut', 'refund', 'reprint'];
  const validMethods = ['efectivo', 'tarjeta', 'mixto', 'transferencia'];
  
  if (!validTypes.includes(ticketData.ticketType)) errors.push('Invalid ticket type');
  if (!validMethods.includes(ticketData.payment.method)) errors.push('Invalid payment method');
  if (ticketData.ticketType === 'sale' && !ticketData.items?.length) errors.push('Sale needs items');
  if (ticketData.ticketType === 'cashRegisterCut' && !ticketData.cutId) errors.push('Cut ID required');
  
  if (errors.length > 0) throw new Error(errors.join(', '));
};

const validateId = (id, name) => {
  if (!id) throw new Error(`${name} required`);
};


const calculateItemTaxes = async (items, companyId) => {
  try {
    if (!items || items.length === 0) return [];

    const itemsWithTaxes = await Promise.all(
      items.map(async (item) => {
        if (item.productId || item.product) {
          const productId = item.productId || item.product;
          const unitPrice = item.unitPrice || 0;
          
          try {
            const taxCalculation = await taxController.calculateProductTaxes(
              productId,
              unitPrice,
              companyId
            );

            const quantity = item.quantity || 1;
            const subtotal = unitPrice * quantity;
            const totalTaxes = taxCalculation.totalTaxes * quantity;

            return {
              ...item,
              productId,
              subtotal,
              taxes: taxCalculation.taxDetails.map(tax => ({
                taxId: tax.taxId,
                name: tax.name,
                type: tax.type,
                rate: tax.rate,
                amount: tax.amount * quantity
              })),
              totalTaxes,
              totalPrice: subtotal + totalTaxes
            };
          } catch (taxError) {
            console.warn(`No taxes found for product ${productId}:`, taxError.message);
            const quantity = item.quantity || 1;
            const subtotal = unitPrice * quantity;
            
            return {
              ...item,
              productId,
              subtotal,
              taxes: [],
              totalTaxes: 0,
              totalPrice: subtotal
            };
          }
        } else {
          const quantity = item.quantity || 1;
          const subtotal = (item.unitPrice || 0) * quantity;
          
          return {
            ...item,
            subtotal,
            taxes: [],
            totalTaxes: 0,
            totalPrice: subtotal
          };
        }
      })
    );

    return itemsWithTaxes;
  } catch (error) {
    console.error('Error calculating item taxes:', error);
    throw new Error(`Error calculating taxes: ${error.message}`);
  }
};


const createTicketWithCoupon = async (saleData, ticketConfig = {}) => {
  try {
    const ticketData = {
      ticketType: 'sale',
      saleId: saleData.id ? new mongoose.Types.ObjectId(saleData.id) : undefined,
      
      
      storeInfo: {
        name: ticketConfig.storeName || 'Mi Negocio',
        address: ticketConfig.storeAddress || '',
        phone: ticketConfig.storePhone || '',
        taxId: ticketConfig.storeTaxId || '',
        email: ticketConfig.storeEmail || ''
      },
      
      
      transactionInfo: {
        date: new Date(),
        cashRegister: ticketConfig.cashRegister || 'CAJA-1',
        cashier: {
          id: saleData.createdBy,
          name: ticketConfig.cashierName || 'Cajero'
        },
        customer: saleData.customer || {}
      },
      

      items: await buildTicketItems(saleData.products),
      

      totals: {
        subtotal: saleData.subtotal || 0,
        totalTaxes: saleData.totalTaxes || 0,
        discounts: 0,
        couponDiscount: saleData.couponDiscount || 0,
        couponCode: saleData.couponCode || null,
        couponName: saleData.couponName || null,
        total: saleData.finalTotal || saleData.total
      },

      appliedCoupon: saleData.couponId ? {
        couponId: saleData.couponId,
        code: saleData.couponCode,
        name: saleData.couponName,
        description: saleData.couponDescription,
        discountType: saleData.couponDiscountType,
        discountValue: saleData.couponDiscountValue,
        discountAmount: saleData.couponDiscount
      } : null,
      
      // Información de pago
      payment: {
        method: saleData.paymentMethod || 'efectivo',
        details: {
          cashReceived: saleData.cashReceived,
          change: saleData.change
        }
      },
      

      company: saleData.company || companyId
    };
  
    const Model = require('./model'); // eslint-disable-line global-require
    ticketData.ticketNumber = await Model.generateTicketNumber(
      'sale', 
      ticketConfig.cashRegister || 'CAJA-1'
    );
    

    const ticket = new Model(ticketData);
    ticket.calculateTotals();
    
    return await ticket.save();
    
  } catch (error) {
    throw new Error(`Error creating ticket with coupon: ${error.message}`);
  }
};

const buildTicketItems = async (products) => {
  const {Product} = require('../products/model'); // eslint-disable-line global-require
  const items = [];
  
  for (const productItem of products) {
    const product = await Product.findById(productItem.productId || productItem.id);
    if (product) {
      const quantity = productItem.quantity || 1;
      const unitPrice = productItem.price || product.price;
      const subtotal = unitPrice * quantity;
      const taxAmount = product.taxExempt ? 0 : (subtotal * (product.taxRate || 0)) / 100;
      
      items.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
        subtotal,
        totalTaxes: taxAmount,
        totalPrice: subtotal + taxAmount,
        taxes: product.taxExempt ? [] : [{
          name: 'IVA',
          type: 'percentage',
          rate: product.taxRate || 0,
          amount: taxAmount
        }]
      });
    }
  }
  
  return items;
};

const processSaleTicketWithCoupon = async (saleData, userId, companyId) => {
  try {
    if (!saleData?.items?.length) throw new Error('Sale data with items required');
    
    
    const itemsWithTaxes = await calculateItemTaxes(saleData.items, companyId);
    
    const saleDataWithCoupon = {
      ...saleData,
      items: itemsWithTaxes,
      
      couponDiscount: saleData.couponDiscount || 0,
      couponCode: saleData.couponCode,
      couponName: saleData.couponName,
      appliedCoupon: saleData.appliedCoupon
    };
    
    return store.processSaleTicketWithCoupon(saleDataWithCoupon, userId, companyId);
  } catch (error) {
    throw new Error(`Error processing sale ticket with coupon: ${error.message}`);
  }
};

const getCouponReceiptTemplate = (ticket) => {
  if (!ticket.appliedCoupon || !ticket.totals.couponDiscount) {
    return '';
  }
  
  return `
    ================================
     CUPÓN APLICADO
    ================================
    Código: ${ticket.appliedCoupon.code}
    ${ticket.appliedCoupon.name ? `Nombre: ${ticket.appliedCoupon.name}` : ''}
    ${ticket.appliedCoupon.description ? `Desc: ${ticket.appliedCoupon.description}` : ''}
    Descuento: $${ticket.totals.couponDiscount.toFixed(2)}
    ================================
  `;
};

const generateTicketReceiptWithCoupon = async (ticketId) => {
  try {
    const ticket = await store.getTicketById(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    
    let receipt = `
    ================================
    ${ticket.storeInfo.name.toUpperCase()}
    ================================
    ${ticket.storeInfo.address}
    ${ticket.storeInfo.phone}
    ================================
    TICKET: ${ticket.ticketNumber}
    FECHA: ${new Date(ticket.transactionInfo.date).toLocaleString()}
    CAJERO: ${ticket.transactionInfo.cashier.name}
    ================================
    PRODUCTOS:
    `;
    
    // Items
    ticket.items.forEach(item => {
      receipt += `
    ${item.productName}
    ${item.quantity} x $${item.unitPrice.toFixed(2)} = $${item.totalPrice.toFixed(2)}`;
    });
    
    receipt += `
    --------------------------------
    Subtotal: $${ticket.totals.subtotal.toFixed(2)}`;
    
    if (ticket.totals.totalTaxes > 0) {
      receipt += `
    Impuestos: $${ticket.totals.totalTaxes.toFixed(2)}`;
    }
    
    if (ticket.totals.discounts > 0) {
      receipt += `
    Descuentos: -$${ticket.totals.discounts.toFixed(2)}`;
    }
    
    if (ticket.totals.couponDiscount > 0) {
      receipt += `
    --------------------------------`;
      receipt += getCouponReceiptTemplate(ticket);
    }
    
    receipt += `
    --------------------------------
    TOTAL: $${ticket.totals.total.toFixed(2)}
    ================================`;
    
    if (ticket.payment.method === 'efectivo') {
      receipt += `
    Efectivo: $${ticket.payment.details.cashReceived?.toFixed(2) || '0.00'}
    Cambio: $${ticket.payment.details.change?.toFixed(2) || '0.00'}`;
    }
    
    receipt += `
    ================================
    ¡Gracias por su compra!
    ================================`;
    
    return receipt;
    
  } catch (error) {
    throw new Error(`Error generating receipt with coupon: ${error.message}`);
  }
};


const createTicketWithTaxes = async (ticketData) => {
  try {
    validateTicketData(ticketData);
    
    if (ticketData.ticketType === 'sale' && ticketData.items && ticketData.items.length > 0) {
      const itemsWithTaxes = await calculateItemTaxes(ticketData.items, ticketData.company || ticketData.companyId);
      // eslint-disable-next-line no-param-reassign
      ticketData.items = itemsWithTaxes;
    }
    
    return store.createTicket(ticketData);
  } catch (error) {
    throw new Error(`Error creating ticket with taxes: ${error.message}`);
  }
};

const createTicket = (ticketData) => {
  validateTicketData(ticketData);
  return store.createTicket(ticketData);
};

const createTicketFromSaleWithTaxes = async (saleId, userId, companyId) => {
  try {
    validateId(saleId, 'Sale ID');
    return store.createTicketFromSaleWithTaxes(saleId, userId, companyId);
  } catch (error) {
    throw new Error(`Error creating ticket from sale: ${error.message}`);
  }
};

const createTicketFromSale = (saleId, userId, companyId) => {
  validateId(saleId, 'Sale ID');
  return store.createTicketFromSale(saleId, userId, companyId);
};

const createTicketFromCut = (cutId, userId, companyId) => {
  validateId(cutId, 'Cut ID');
  return store.createTicketFromCut(cutId, userId, companyId);
};

const getTickets = (filters = {}) => store.getTickets(filters);

const getTicketById = (ticketId) => {
  validateId(ticketId, 'Ticket ID');
  return store.getTicketById(ticketId);
};

const generateTicketData = (ticketId) => {
  validateId(ticketId, 'Ticket ID');
  return store.generateTicketData(ticketId);
};

const generateTicketPDF = (ticketId, format = '80mm') => {
  validateId(ticketId, 'Ticket ID');
  if (!['58mm', '80mm'].includes(format)) throw new Error('Invalid format');
  return store.generateTicketPDF(ticketId, format);
};

const reprintTicket = (ticketId, userId) => {
  validateId(ticketId, 'Ticket ID');
  return store.reprintTicket(ticketId, userId);
};

const cancelTicket = (ticketId, reason, userId) => {
  validateId(ticketId, 'Ticket ID');
  return store.cancelTicket(ticketId, reason, userId);
};

const getTicketStats = (filters = {}) => store.getTicketStats(filters);

const updateStoreInfo = (storeInfo, companyId) => {
  if (!storeInfo?.name) throw new Error('Store name required');
  return store.updateStoreInfo(storeInfo, companyId);
};

const getStoreInfo = (companyId) => store.getStoreInfo(companyId);

const processSaleTicketWithTaxes = async (saleData, userId, companyId) => {
  try {
    if (!saleData?.items?.length) throw new Error('Sale data with items required');
    
    const itemsWithTaxes = await calculateItemTaxes(saleData.items, companyId);
    
    const saleDataWithTaxes = {
      ...saleData,
      items: itemsWithTaxes
    };
    
    return store.processSaleTicketWithTaxes(saleDataWithTaxes, userId, companyId);
  } catch (error) {
    throw new Error(`Error processing sale with taxes: ${error.message}`);
  }
};

const processSaleTicket = (saleData, userId, companyId) => {
  if (!saleData?.items?.length) throw new Error('Sale data with items required');
  return store.processSaleTicket(saleData, userId, companyId);
};

const processRefundTicket = (refundData, userId, companyId) => {
  if (!refundData?.originalSaleId) throw new Error('Original sale ID required');
  return store.processRefundTicket(refundData, userId, companyId);
};



const getTaxReport = async (companyId, startDate, endDate) => {
  try {
    if (!companyId) throw new Error('Company ID required');
    
    const tickets = await store.getTicketsByDateRange(companyId, startDate, endDate, ['active']);
    
    const report = {
      period: {
        startDate: startDate || 'N/A',
        endDate: endDate || 'N/A'
      },
      summary: {
        totalTickets: tickets.length,
        totalSales: 0,
        totalTaxes: 0,
        totalNet: 0,
        totalCouponDiscounts: 0,
      },
      taxBreakdown: {},
      couponBreakdown: {}, 
      ticketDetails: []
    };

    tickets.forEach(ticket => {
      if (ticket.totals) {
        report.summary.totalSales += ticket.totals.total || 0;
        report.summary.totalTaxes += ticket.totals.totalTaxes || 0;
        report.summary.totalNet += ticket.totals.subtotal || 0;
        report.summary.totalCouponDiscounts += ticket.totals.couponDiscount || 0; 
      }

     
      if (ticket.appliedCoupon && ticket.totals.couponDiscount > 0) {
        const couponKey = ticket.appliedCoupon.code || 'Unknown Coupon';
        if (!report.couponBreakdown[couponKey]) {
          report.couponBreakdown[couponKey] = {
            code: ticket.appliedCoupon.code,
            name: ticket.appliedCoupon.name,
            totalDiscount: 0,
            usageCount: 0
          };
        }
        report.couponBreakdown[couponKey].totalDiscount += ticket.totals.couponDiscount;
        report.couponBreakdown[couponKey].usageCount += 1;
      }

      if (ticket.taxBreakdown && ticket.taxBreakdown.length > 0) {
        ticket.taxBreakdown.forEach(tax => {
          const taxKey = tax.name || 'Unknown Tax';
          if (!report.taxBreakdown[taxKey]) {
            report.taxBreakdown[taxKey] = {
              name: tax.name,
              type: tax.type,
              totalAmount: 0,
              ticketCount: 0
            };
          }
          report.taxBreakdown[taxKey].totalAmount += tax.totalAmount || 0;
          report.taxBreakdown[taxKey].ticketCount += 1;
        });
      }

      report.ticketDetails.push({
        ticketNumber: ticket.ticketNumber,
        date: ticket.createdAt || ticket.transactionInfo?.date,
        subtotal: ticket.totals?.subtotal || 0,
        totalTaxes: ticket.totals?.totalTaxes || 0,
        couponDiscount: ticket.totals?.couponDiscount || 0, 
        couponCode: ticket.totals?.couponCode || null, 
        total: ticket.totals?.total || 0
      });
    });

    report.summary.totalSales = parseFloat(report.summary.totalSales.toFixed(2));
    report.summary.totalTaxes = parseFloat(report.summary.totalTaxes.toFixed(2));
    report.summary.totalNet = parseFloat(report.summary.totalNet.toFixed(2));
    report.summary.totalCouponDiscounts = parseFloat(report.summary.totalCouponDiscounts.toFixed(2)); 

    Object.keys(report.taxBreakdown).forEach(key => {
      report.taxBreakdown[key].totalAmount = parseFloat(report.taxBreakdown[key].totalAmount.toFixed(2));
    });

    
    Object.keys(report.couponBreakdown).forEach(key => {
      report.couponBreakdown[key].totalDiscount = parseFloat(report.couponBreakdown[key].totalDiscount.toFixed(2));
    });

    return report;
  } catch (error) {
    throw new Error(`Error generating tax report: ${error.message}`);
  }
};

const calculateTicketTaxes = async (items, companyId) => {
  try {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Items array is required and cannot be empty');
    }

    const itemsWithTaxes = await calculateItemTaxes(items, companyId);
    
    const totals = {
      subtotal: 0,
      totalTaxes: 0,
      total: 0
    };

    const taxSummary = {};

    itemsWithTaxes.forEach(item => {
      totals.subtotal += item.subtotal || 0;
      totals.totalTaxes += item.totalTaxes || 0;

      if (item.taxes && item.taxes.length > 0) {
        item.taxes.forEach(tax => {
          const taxKey = tax.taxId ? tax.taxId.toString() : tax.name;
          if (!taxSummary[taxKey]) {
            taxSummary[taxKey] = {
              taxId: tax.taxId,
              name: tax.name,
              type: tax.type,
              totalAmount: 0
            };
          }
          taxSummary[taxKey].totalAmount += tax.amount || 0;
        });
      }
    });

    totals.total = totals.subtotal + totals.totalTaxes;

    return {
      items: itemsWithTaxes,
      totals: {
        subtotal: parseFloat(totals.subtotal.toFixed(2)),
        totalTaxes: parseFloat(totals.totalTaxes.toFixed(2)),
        total: parseFloat(totals.total.toFixed(2))
      },
      taxBreakdown: Object.values(taxSummary).map(tax => ({
        ...tax,
        totalAmount: parseFloat(tax.totalAmount.toFixed(2))
      }))
    };
  } catch (error) {
    throw new Error(`Error calculating ticket taxes: ${error.message}`);
  }
};


module.exports = {
  createTicket,
  createTicketFromSale,
  createTicketFromCut,
  getTickets,
  getTicketById,
  generateTicketData,
  generateTicketPDF,
  reprintTicket,
  cancelTicket,
  getTicketStats,
  updateStoreInfo,
  getStoreInfo,
  processSaleTicket,
  processRefundTicket,
  createTicketWithTaxes,
  createTicketFromSaleWithTaxes,
  processSaleTicketWithTaxes,
  calculateTicketTaxes,
  getTaxReport,
  calculateItemTaxes,
  createTicketWithCoupon,
  buildTicketItems,
  processSaleTicketWithCoupon,
  getCouponReceiptTemplate,
  generateTicketReceiptWithCoupon
};