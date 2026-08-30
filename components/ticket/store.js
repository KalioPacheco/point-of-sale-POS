const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const Model = require('./model');
const SalesModel = require('../sales/model');
const CashRegisterCutsModel = require('../cashRegisterCuts/model');
const UsersModel = require('../users/model');
const CompaniesModel = require('../companies/model');
const { Product, StockHistory } = require('../products/model');
const CashMovement = require('../cashMovements/model');
const Coupon = require('../coupons/model');
const CashRegisterShift = require('../cashRegisterShifts/model');

const DEFAULT_STORE_CONFIG = {
  name: 'Nombre de la Empresa',
  address: 'Dirección de la Empresa',
  phone: '',
  taxId: '',
  email: ''
};

const cleanString = (value) => (typeof value === 'string' ? value.trim() : '');

const withFallback = (value, fallback = '') => {
  const cleaned = cleanString(value);
  return cleaned || fallback;
};

const formatCompanyAddress = (address) => {
  if (typeof address === 'string') {
    return withFallback(address, DEFAULT_STORE_CONFIG.address);
  }

  if (!address || typeof address !== 'object') {
    return DEFAULT_STORE_CONFIG.address;
  }

  const street = cleanString(address.street);
  const ext = cleanString(address.number?.ext);
  const int = cleanString(address.number?.int);
  const numberText = [ext, int ? `Int ${int}` : ''].filter(Boolean).join(' ');
  const line1 = [street, numberText].filter(Boolean).join(' ');
  const city = cleanString(address.city);
  const state = cleanString(address.state);
  const country = cleanString(address.country);

  const formatted = [line1, city, state, country].filter(Boolean).join(', ');
  return formatted || DEFAULT_STORE_CONFIG.address;
};

const mapCompanyToStoreConfig = (company) => {
  if (!company) {
    return { ...DEFAULT_STORE_CONFIG };
  }

  const persisted = company.ticketStoreConfig && typeof company.ticketStoreConfig === 'object'
    ? company.ticketStoreConfig
    : {};

  return {
    name: withFallback(persisted.name, withFallback(company.name, DEFAULT_STORE_CONFIG.name)),
    address: withFallback(persisted.address, formatCompanyAddress(company.address)),
    phone: withFallback(persisted.phone, ''),
    taxId: withFallback(persisted.taxId, withFallback(company.rfc, '')),
    email: withFallback(persisted.email, '')
  };
};

const normalizeStoreConfigInput = (storeInfo, currentStoreInfo = DEFAULT_STORE_CONFIG) => ({
  name: withFallback(storeInfo?.name, currentStoreInfo.name),
  address: withFallback(storeInfo?.address, currentStoreInfo.address),
  phone: withFallback(storeInfo?.phone, currentStoreInfo.phone),
  taxId: withFallback(storeInfo?.taxId, currentStoreInfo.taxId),
  email: withFallback(storeInfo?.email, currentStoreInfo.email)
});

const normalizeObjectId = (value) => {
  if (!value) return undefined;
  const asString = typeof value === 'string' ? value : value.toString?.();
  if (!asString || asString === 'default-company-id') return undefined;
  return mongoose.Types.ObjectId.isValid(asString) ? asString : undefined;
};

const normalizeTaxBreakdown = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      taxId: normalizeObjectId(item.taxId),
      name: item.name || 'Impuesto',
      type: item.type || 'percentage',
      totalAmount: Number(item.totalAmount) || 0
    }));
};

const normalizeAppliedCoupon = (value, totals = {}) => {
  if (!value || typeof value !== 'object') return null;

  const validDiscountTypes = ['percentage', 'fixed_amount'];
  const couponId = normalizeObjectId(value.couponId || value.id);
  const code = value.code || totals.couponCode || null;
  const name = value.name || totals.couponName || null;
  const description = value.description || null;
  const discountType = validDiscountTypes.includes(value.discountType)
    ? value.discountType
    : undefined;
  const discountValue = Number(value.discountValue);
  const discountAmount = Number(value.discountAmount ?? totals.couponDiscount ?? 0);

  if (!couponId && !code && !name && !description && !discountAmount) {
    return null;
  }

  return {
    couponId,
    code,
    name,
    description,
    discountType,
    discountValue: Number.isNaN(discountValue) ? undefined : discountValue,
    discountAmount
  };
};

const getCompany = async (companyId, options = {}) => {
  const companiesModel = options.companiesModel || CompaniesModel;
  if (!companyId || companyId === 'default-company-id') return null;
  try {
    return await companiesModel.findById(companyId);
  } catch {
    return null;
  }
};

async function getStoreInfo(companyId, options = {}) {
  try {
    const company = await getCompany(companyId, options);
    if (!company) return { ...DEFAULT_STORE_CONFIG };
    return mapCompanyToStoreConfig(company);
  } catch (error) {
    console.error('Error getting store info:', error);
    return { ...DEFAULT_STORE_CONFIG };
  }
}

async function updateStoreInfo(storeInfo, companyId, options = {}) {
  try {
    const company = await getCompany(companyId, options);
    if (!company) {
      throw new Error('No se encontró empresa para persistir store-config');
    }

    const currentStoreInfo = mapCompanyToStoreConfig(company);
    const normalizedStoreInfo = normalizeStoreConfigInput(storeInfo, currentStoreInfo);

    company.ticketStoreConfig = {
      ...(company.ticketStoreConfig || {}),
      ...normalizedStoreInfo,
      updatedAt: new Date(),
    };

    if (normalizedStoreInfo.name) {
      company.name = normalizedStoreInfo.name;
    }

    await company.save();

    return {
      success: true,
      message: 'Store updated',
      storeInfo: mapCompanyToStoreConfig(company)
    };

  } catch (error) {
    if (!/No se encontró empresa para persistir store-config/i.test(error.message || '')) {
      console.error('Error updating store:', error);
    }
    throw error;
  }
}

async function createTicket(ticketData) {
  try {
    const companyId = normalizeObjectId(ticketData.companyId);
    const normalizedItems = Array.isArray(ticketData.items)
      ? ticketData.items.map(item => ({
          ...item,
          productId: normalizeObjectId(item.productId),
          taxes: Array.isArray(item.taxes)
            ? item.taxes.map(tax => ({
                ...tax,
                taxId: normalizeObjectId(tax.taxId),
                amount: Number(tax.amount) || 0,
                rate: Number(tax.rate) || 0
              }))
            : []
        }))
      : [];

    const ticketNumber = await Model.generateTicketNumber(
      ticketData.ticketType,
      ticketData.transactionInfo?.cashRegister || 'CAJA-1',
      companyId
    );

    const storeInfoSource = ticketData.storeInfo?.name &&
      ticketData.storeInfo.name !== 'Nombre de la Empresa' 
      ? ticketData.storeInfo 
      : await getStoreInfo(ticketData.companyId);

    const storeInfo = normalizeStoreConfigInput(storeInfoSource, DEFAULT_STORE_CONFIG);

    const newTicket = new Model({
      ticketNumber,
      ticketType: ticketData.ticketType,
      saleId: ticketData.saleId,
      cutId: ticketData.cutId,
      storeInfo,
      transactionInfo: ticketData.transactionInfo || {},
      items: normalizedItems,
      totals: ticketData.totals || {},
      payment: ticketData.payment || {},
      format: ticketData.format || {},
      notes: ticketData.notes,
      company: companyId,
      taxBreakdown: normalizeTaxBreakdown(ticketData.taxBreakdown),
      appliedCoupon: normalizeAppliedCoupon(ticketData.appliedCoupon, ticketData.totals)
    });

    newTicket.calculateTotals();
    newTicket.taxBreakdown = normalizeTaxBreakdown(newTicket.taxBreakdown);
    const savedTicket = await newTicket.save();
    
    return {
      success: true,
      ticket: {
        id: savedTicket.id,
        ticketNumber: savedTicket.ticketNumber,
        ticketType: savedTicket.ticketType,
        total: savedTicket.totals.total,
        subtotal: savedTicket.totals.subtotal,
        totalTaxes: savedTicket.totals.totalTaxes,
        taxBreakdown: savedTicket.taxBreakdown,
        discounts: savedTicket.totals.discounts,
        appliedCoupon: savedTicket.appliedCoupon
      },
      message: `Ticket ${ticketNumber} created`
    };

  } catch (error) {
    console.error('Error creating ticket:', error);
    throw error;
  }
}

const mapSaleToTicketData = (sale, storeInfo, companyId) => {
  const items = sale.products?.length > 0
    ? sale.products.map(item => {
        const quantity = item.quantity || 1;
        const unitPrice = item.priceSnapshot?.price || 0;
        const subtotal = item.subtotal || (unitPrice * quantity);
        const totalTaxes = item.taxAmount || 0;
        const taxRate = item.priceSnapshot?.taxRate || 0;
        const taxes = item.priceSnapshot?.taxExempt
          ? []
          : [{
              name: 'IVA',
              type: 'percentage',
              rate: taxRate,
              amount: totalTaxes
            }];

        return {
          productId: normalizeObjectId(item.productId?.id || item.productId),
          productName: item.priceSnapshot?.name || item.productId?.name || 'Producto',
          quantity,
          unitPrice,
          subtotal,
          totalPrice: item.total || (subtotal + totalTaxes),
          taxes,
          totalTaxes
        };
      })
    : [{
        productName: 'Venta',
        quantity: 1,
        unitPrice: sale.finalTotal || sale.total || 0,
        subtotal: sale.subtotal || sale.total || 0,
        totalPrice: sale.finalTotal || sale.total || 0,
        taxes: [],
        totalTaxes: 0
      }];

  return {
    ticketType: 'sale',
    saleId: sale.id,
    storeInfo,
    transactionInfo: {
      date: sale.createdAt,
      cashRegister: sale.cashRegister || 'CAJA-1',
      cashier: {
        id: sale.createdBy?.id,
        name: sale.createdBy?.name || sale.createdBy?.userName || 'Cajero'
      }
    },
    items,
    totals: {
      subtotal: sale.subtotal || sale.total || 0,
      totalTaxes: sale.totalTaxes || 0,
      total: sale.finalTotal || sale.total || 0,
      discounts: sale.discounts || 0,
      couponDiscount: sale.couponDiscount || 0,
      couponCode: sale.couponCode,
      couponName: sale.couponName
    },
    payment: {
      method: sale.paymentMethod || 'efectivo',
      details: sale.paymentDetails || {}
    },
    taxBreakdown: sale.taxBreakdown || [],
    appliedCoupon: sale.couponId || sale.couponCode ? {
      couponId: sale.couponId,
      code: sale.couponCode,
      name: sale.couponName,
      discountAmount: sale.couponDiscount || 0
    } : null,
    companyId
  };
};

async function createTicketFromSaleWithTaxes(saleId, userId, companyId) {
  try {
    const sale = await SalesModel.findOne({ _id: saleId, company: companyId, disable: false })
      .populate('products.productId', 'name')
      .populate('createdBy', 'userName name');

    if (!sale) throw new Error('Sale not found');

    const storeInfo = await getStoreInfo(companyId);
    const ticketData = mapSaleToTicketData(sale, storeInfo, companyId);
    
    return createTicket(ticketData);

  } catch (error) {
    console.error('Error creating ticket from sale with taxes:', error);
    throw error;
  }
}

async function createTicketFromSale(saleId, userId, companyId) {
  try {
    const sale = await SalesModel.findOne({ _id: saleId, company: companyId, disable: false })
      .populate('products.productId', 'name')
      .populate('createdBy', 'userName name');

    if (!sale) throw new Error('Sale not found');

    const storeInfo = await getStoreInfo(companyId);
    const ticketData = mapSaleToTicketData(sale, storeInfo, companyId);
    ticketData.totals.taxes = sale.taxes || 0;
    delete ticketData.totals.totalTaxes;
    
    return createTicket(ticketData);

  } catch (error) {
    console.error('Error creating ticket from sale:', error);
    throw error;
  }
}

async function createTicketFromCut(cutId, _unusedUserId, companyId) {
  try {
    const cut = await CashRegisterCutsModel.findOne({ _id: cutId, company: companyId })
      .populate('cashier', 'userName name');

    if (!cut) throw new Error('Cut not found');

    return createTicket({
      ticketType: 'cashRegisterCut',
      cutId: cut.id,
      storeInfo: await getStoreInfo(companyId),
      transactionInfo: {
        date: cut.cutDate,
        cashRegister: cut.cashRegister,
        cashier: {
          id: cut.cashier.id,
          name: cut.cashier.name || cut.cashier.userName
        }
      },
      items: [],
      totals: { total: cut.salesSummary.netSales || 0 },
      payment: { method: 'efectivo' },
      notes: `Corte: ${cut.cutNumber}`,
      companyId
    });

  } catch (error) {
    console.error('Error creating ticket from cut:', error);
    throw error;
  }
}

async function getTickets(filters = {}) {
  try {
    const query = { disable: false };

    if (filters.ticketType) {
      const ticketTypes = String(filters.ticketType).split(',').filter(Boolean);
      query.ticketType = ticketTypes.length > 1 ? { $in: ticketTypes } : ticketTypes[0];
    }
    if (filters.cashRegister) query['transactionInfo.cashRegister'] = filters.cashRegister;
    if (filters.companyId && filters.companyId !== 'default-company-id') {
      query.company = filters.companyId;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
    
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
    
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const tickets = await Model.find(query)
      .populate('transactionInfo.cashier.id', 'userName name')
      .populate('saleId', 'saleNumber total')
      .populate('cutId', 'cutNumber')
      .populate('taxBreakdown.taxId', 'name type')
      .populate('items.taxes.taxId', 'name type')
      .sort({ createdAt: -1 })
      .limit(filters.limit || 50);

    return { tickets, count: tickets.length, filters };

  } catch (error) {
    console.error('Error getting tickets:', error);
    throw error;
  }
}

async function getTicketById(ticketId) {
  try {
    const ticket = await Model.findById(ticketId)
      .populate('transactionInfo.cashier.id', 'userName name')
      .populate('saleId')
      .populate('cutId')
      .populate('taxBreakdown.taxId', 'name type')
      .populate('items.taxes.taxId', 'name type');

    if (!ticket) throw new Error('Ticket not found');
    return ticket;

  } catch (error) {
    console.error('Error getting ticket:', error);
    throw error;
  }
}

async function getTicketsByDateRange(companyId, startDate, endDate, statuses = ['active']) {
  try {
    const query = { 
      disable: false,
      status: { $in: statuses }
    };

    if (companyId && companyId !== 'default-company-id') {
      query.company = companyId;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const tickets = await Model.find(query)
      .populate('taxBreakdown.taxId', 'name type')
      .sort({ createdAt: -1 });

    return tickets;

  } catch (error) {
    console.error('Error getting tickets by date range:', error);
    throw error;
  }
}

async function generateTicketData(ticketId) {
  try {
    const ticket = await getTicketById(ticketId);
    const couponCode = ticket.appliedCoupon?.code || ticket.totals?.couponCode || null;
    const couponName = ticket.appliedCoupon?.name || ticket.totals?.couponName || null;
    const couponDescription = ticket.appliedCoupon?.description || couponName;
    const discountAmount = ticket.appliedCoupon?.discountAmount
      || ticket.totals?.couponDiscount
      || ticket.totals?.discounts
      || 0;

    const data = {
      storeName: ticket.storeInfo.name,
      storeAddress: withFallback(ticket.storeInfo.address, DEFAULT_STORE_CONFIG.address),
      storePhone: ticket.storeInfo.phone,
      storeEmail: ticket.storeInfo.email,
      taxId: ticket.storeInfo.taxId,
      ticketNumber: ticket.ticketNumber,
      ticketType: ticket.ticketType,
      date: ticket.transactionInfo.date.toLocaleDateString('es-MX'),
      time: ticket.transactionInfo.date.toLocaleTimeString('es-MX'),
      cashRegister: ticket.transactionInfo.cashRegister,
      cashier: ticket.transactionInfo.cashier.name,
      items: ticket.items.map(item => ({
        name: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal || (item.unitPrice * item.quantity),
        total: item.totalPrice,
        variant: item.variant?.name,
        discount: item.discount || 0,
        taxes: item.taxes || [],
        totalTaxes: item.totalTaxes || 0
      })),
      subtotal: ticket.totals.subtotal,
      taxes: ticket.totals.taxes || ticket.totals.totalTaxes,
      totalTaxes: ticket.totals.totalTaxes || ticket.totals.taxes, 
      discounts: discountAmount,
      total: ticket.totals.total,
      taxBreakdown: ticket.taxBreakdown || [],
      paymentMethod: ticket.payment.method,
      cashReceived: ticket.payment.details?.cashReceived,
      change: ticket.payment.details?.change,
      cashAmount: ticket.payment.details?.cashAmount,
      cardAmount: ticket.payment.details?.cardAmount,
      customerName: ticket.transactionInfo.customer?.name,
      notes: ticket.notes,
      couponCode,
      couponName,
      couponDescription,
      discountAmount
    };

    if (!ticket.printInfo?.printed) {
      await ticket.markAsPrinted?.();
    }

    return data;

  } catch (error) {
    console.error('Error generating ticket data:', error);
    throw error;
  }
}

async function generateTicketPDF(ticketId, format, res) {
  try {
    const data = await generateTicketData(ticketId);
    const width = format === '58mm' ? 164 : 226;
    const doc = new PDFDocument({ size: [width, 841], margin: 10 });

    if (res) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="ticket-${ticketId}.pdf"`);
      doc.pipe(res);
    }

    // HEADER
    doc.fontSize(14).text(data.storeName.toUpperCase(), { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(8).text(data.storeAddress, { align: 'center' });
    
    if (data.storePhone) {
      doc.moveDown(0.2);
      doc.text(`Tel: ${data.storePhone}`, { align: 'center' });
    }
    if (data.storeEmail) {
      doc.moveDown(0.2);
      doc.text(data.storeEmail, { align: 'center' });
    }

    // TICKET INFO
    doc.moveDown(0.5);
    doc.fontSize(8).text(`${data.ticketNumber}          ${data.date} ${data.time}`, { align: 'center' });
    doc.moveDown(0.8);

    // PRODUCTOS/ITEMS
    if (data.ticketType === 'sale' && data.items.length > 0) {
      doc.fontSize(7);
      doc.text('CANT  PCIO U.  %DESC  IMPORTE');
      doc.text('--------------------------------');
      doc.moveDown(0.3);

      data.items.forEach(item => {
        const name = item.variant ? `${item.name} - ${item.variant}` : item.name;
        doc.text(name);
        
        const qty = item.quantity.toString().padEnd(5);
        const price = `$${item.unitPrice.toFixed(2)}`.padEnd(9);
        const disc = item.discount ? `${((item.discount / (item.total + item.discount)) * 100).toFixed(0)}%`.padEnd(6) : '0%'.padEnd(6);
        const total = `$${item.total.toFixed(2)}`;
        
        doc.text(`${qty} ${price} ${disc} ${total}`);
        
        if (item.taxes && item.taxes.length > 0) {
          doc.fontSize(6);
          item.taxes.forEach(tax => {
            doc.text(`  ${tax.name}: $${tax.amount.toFixed(2)}`, { align: 'left' });
          });
          doc.fontSize(7);
        }
        
        doc.moveDown(0.2);
      });
      
      doc.text('--------------------------------');
      doc.moveDown(0.4);
    }

    // SUBTOTAL
    if (data.subtotal || (data.totalTaxes > 0 || data.discounts > 0)) {
      doc.fontSize(8);
      const baseSubtotal = data.subtotal || (data.total + (data.discounts || 0) - (data.totalTaxes || 0));
      doc.text('SUBTOTAL:', 10, doc.y, { width: width - 80 });
      doc.text(`$${baseSubtotal.toFixed(2)}`, width - 70, doc.y - 10, { width: 60, align: 'right' });
      doc.moveDown(0.3);
    }

    if (data.discounts > 0 || data.couponCode) {
      doc.fontSize(8);
      

      if (data.couponCode) {
        const couponText = data.couponName ? data.couponName : `CUPÓN: ${data.couponCode}`;
        doc.text(couponText);
        doc.moveDown(0.2);
      }

      if (data.discounts > 0) {
        doc.text('DESCUENTO:', 10, doc.y, { width: width - 80 });
        doc.text(`-$${data.discounts.toFixed(2)}`, width - 70, doc.y - 10, { width: 60, align: 'right' });
        doc.moveDown(0.3);
      }
      
      doc.text('--------------------------------');
      doc.moveDown(0.3);
    }

    // IMPUESTOS
    if (data.taxBreakdown && data.taxBreakdown.length > 0 && data.totalTaxes > 0) {
      doc.fontSize(8);
      doc.text('IMPUESTOS:');
      doc.fontSize(7);
      
      data.taxBreakdown.forEach(tax => {
        doc.text(`${tax.name}:`, 10, doc.y, { width: width - 80 });
        doc.text(`$${tax.totalAmount.toFixed(2)}`, width - 70, doc.y - 10, { width: 60, align: 'right' });
        doc.moveDown(0.2);
      });
      
      doc.text('TOTAL IMPUESTOS:', 10, doc.y, { width: width - 80 });
      doc.text(`$${data.totalTaxes.toFixed(2)}`, width - 70, doc.y - 10, { width: 60, align: 'right' });
      doc.moveDown(0.3);
      
      doc.text('--------------------------------');
      doc.moveDown(0.3);
    }

    doc.fontSize(10);
    doc.text('TOTAL:', 10, doc.y, { width: width - 80 });
    doc.text(`$${data.total.toFixed(2)}`, width - 70, doc.y - 10, { width: 60, align: 'right' });
    doc.fontSize(8);
    doc.moveDown(0.5);

    const methods = {
      efectivo: 'EFECTIVO',
      tarjeta: 'TARJETA', 
      mixto: 'MIXTO',
      transferencia: 'TRANSFERENCIA'
    };
    
    doc.text('FORMA DE PAGO:');
    doc.text(methods[data.paymentMethod] || 'NO ESPECIFICADO');
    doc.moveDown(0.3);

    if (['efectivo', 'mixto'].includes(data.paymentMethod)) {
      doc.text('EFECTIVO:');
      const cash = data.paymentMethod === 'efectivo' 
        ? data.cashReceived || data.total
        : data.cashAmount || 0;
      doc.text(`$${cash.toFixed(2)}`, { align: 'right' });
      doc.moveDown(0.3);
    }

    doc.text('ADEUDO: $0.00', { align: 'left' });
    doc.text('CAMBIO:', { align: 'left' });
    doc.text(`$${(data.change || 0).toFixed(2)}`, { align: 'right' });
    doc.moveDown(0.5);

    doc.text('CLIENTE:');
    doc.text(data.customerName?.trim() || 'PÚBLICO GENERAL');
    doc.moveDown(0.4);

    doc.text('CAJERO:');
    doc.text(data.cashier || 'N/A');
    doc.moveDown(0.5);
    doc.fontSize(6);
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, { align: 'center' });

    doc.end();
    return doc;

  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

async function generateTicketPDFFromSale(saleId, format = '80mm', res, userId, companyId) {
  try {
    if (!saleId) throw new Error('Sale ID required');

    const existingTicket = await Model.findOne({
      saleId,
      company: companyId,
      disable: false
    }).sort({ createdAt: -1 });

    let ticketId = existingTicket?.id;
    if (!ticketId) {
      const createdTicket = await createTicketFromSaleWithTaxes(saleId, userId, companyId);
      ticketId = createdTicket?.ticket?.id;
    }

    if (!ticketId) throw new Error('Could not generate ticket for sale');

    return generateTicketPDF(ticketId, format, res);
  } catch (error) {
    console.error('Error generating PDF from sale:', error);
    throw error;
  }
}

async function reprintTicket(ticketId, userId) {
  try {
    const ticket = await Model.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    await ticket.reprint(userId);
    return {
      success: true,
      message: `Ticket reprinted`,
      reprintCount: ticket.printInfo.reprintCount
    };
  } catch (error) {
    console.error('Error reprinting:', error);
    throw error;
  }
}

async function cancelTicket(ticketId, reason, userId, companyId) {
  try {
    const ticket = await Model.findOne({ _id: ticketId, company: companyId });
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.ticketType === 'sale' && ticket.saleId && ticket.status === 'active') {
      return processRefundTicket({ originalSaleId: ticket.saleId, reason }, userId, companyId);
    }

    ticket.status = 'cancelled';
    ticket.notes = `${ticket.notes || ''} | CANCELADO: ${reason}`.trim();
    await ticket.save();

    return {
      success: true,
      message: `Ticket cancelled`,
      reason
    };
  } catch (error) {
    console.error('Error cancelling:', error);
    throw error;
  }
}

async function getTicketStats(filters = {}) {
  try {
    const query = { disable: false };

    if (filters.companyId && filters.companyId !== 'default-company-id') {
      query.company = filters.companyId;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const stats = await Model.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$ticketType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totals.total' },
          totalTaxes: { $sum: '$totals.totalTaxes' }, 
          avgAmount: { $avg: '$totals.total' }
        }
      }
    ]);

    const summary = { 
      totalTickets: 0, 
      totalAmount: 0, 
      totalTaxes: 0, 
      byType: {} 
    };
    
    stats.forEach(stat => {
      summary.totalTickets += stat.count;
      summary.totalAmount += stat.totalAmount;
      summary.totalTaxes += stat.totalTaxes || 0; 
      summary.byType[stat.id] = stat;
    });

    return summary;
  } catch (error) {
    console.error('Error getting stats:', error);
    throw error;
  }
}

const createSaleTicket = async (saleData, userId, companyId, withTaxes = false) => {
  try {
    const storeInfo = await getStoreInfo(companyId);
    const user = await UsersModel.findById(userId);
    
    const totals = {
      subtotal: saleData.subtotal || 0,
      discounts: saleData.discounts || 0,
      couponDiscount: saleData.couponDiscount || 0,
      couponCode: saleData.couponCode,
      couponName: saleData.couponName,
      total: saleData.total || 0
    };

    if (withTaxes) {
      totals.totalTaxes = saleData.totalTaxes || 0;
      totals.taxes = saleData.taxes || saleData.totalTaxes || 0;
    } else {
      totals.taxes = saleData.taxes || 0;
    }
    
    return createTicket({
      ticketType: 'sale',
      storeInfo,
      transactionInfo: {
        date: new Date(),
        cashRegister: saleData.cashRegister || 'CAJA-1',
        cashier: {
          id: userId,
          name: user?.name || user?.userName || 'Cajero'
        },
        customer: saleData.customer || {}
      },
      items: saleData.items || [],
      totals,
      payment: {
        method: saleData.paymentMethod || 'efectivo',
        details: saleData.paymentDetails || {}
      },
      taxBreakdown: withTaxes ? (saleData.taxBreakdown || []) : [],
      appliedCoupon: normalizeAppliedCoupon(saleData.appliedCoupon, totals),
      notes: saleData.notes,
      companyId
    });
  } catch (error) {
    console.error('Error processing sale:', error);
    throw error;
  }
};

async function processSaleTicket(saleData, userId, companyId) {
  return createSaleTicket(saleData, userId, companyId, false);
}

async function processSaleTicketWithTaxes(saleData, userId, companyId) {
  return createSaleTicket(saleData, userId, companyId, true);
}

async function processSaleTicketWithCoupon(saleData, userId, companyId) {
  return createSaleTicket(saleData, userId, companyId, true);
}

async function processRefundTicket(refundData, userId, companyId) {
  const session = await mongoose.startSession();
  try {
    let refundTicket;
    await session.withTransaction(async () => {
      const sale = await SalesModel.findOne({
        _id: refundData.originalSaleId,
        company: companyId,
        status: 'confirmed',
        disable: false
      }).session(session);
      if (!sale) {
        const existingSale = await SalesModel.findOne({
          _id: refundData.originalSaleId,
          company: companyId,
          disable: false
        }).select('status').session(session);
        if (existingSale) throw new Error('Sale already refunded or cancelled');
        throw new Error('Sale not found');
      }
      if (!refundData.reason?.trim()) throw new Error('Refund reason is required');

      const shiftFilter = {
        company: companyId,
        cashier: userId,
        status: 'open'
      };
      if (refundData.shiftId) shiftFilter._id = refundData.shiftId;
      if (refundData.cashRegister) shiftFilter.cashRegister = refundData.cashRegister;
      const refundShift = await CashRegisterShift.findOne(shiftFilter).session(session);
      if (!refundShift) throw new Error('An open cashier shift is required for a refund');

      for (const item of sale.products) {
        let previousStock;
        let updateResult;
        if (item.variantId) {
          const product = await Product.findOne({
            _id: item.productId,
            company: companyId,
            'variants._id': item.variantId
          }).session(session);
          const variant = product?.variants.id(item.variantId);
          if (!variant) throw new Error(`Product variant not found for ${item.priceSnapshot.name}`);
          previousStock = Number(variant.stock || 0);
          updateResult = await Product.updateOne(
            { _id: item.productId, company: companyId, 'variants._id': item.variantId },
            { $inc: { 'variants.$.stock': item.quantity } },
            { session }
          );
        } else {
          const product = await Product.findOne({
            _id: item.productId,
            company: companyId
          }).session(session);
          if (!product) throw new Error(`Product not found for ${item.priceSnapshot.name}`);
          previousStock = Number(product.stock || 0);
          updateResult = await Product.updateOne(
            { _id: item.productId, company: companyId },
            { $inc: { stock: item.quantity } },
            { session }
          );
        }
        if (updateResult.modifiedCount !== 1) {
          throw new Error(`Inventory could not be restored for ${item.priceSnapshot.name}`);
        }
        await StockHistory.create([{
          product: item.productId,
          user: userId,
          type: 'add',
          quantity: item.quantity,
          previousStock,
          newStock: previousStock + item.quantity,
          reason: `Devolucion venta ${sale._id}`
        }], { session });
      }

      sale.status = 'refunded';
      sale.refund = true;
      sale.updated = true;
      sale.updatedAt = new Date();
      sale.refundInfo = {
        refundedAt: new Date(),
        refundedBy: userId,
        reason: refundData.reason.trim(),
        shift: refundShift._id,
        cashRegister: refundShift.cashRegister
      };
      await sale.save({ session });

      await CashMovement.create([{
        movementNumber: `REFUND-${sale._id}`,
        type: 'refund',
        amount: sale.finalTotal,
        concept: `Devolucion ${sale._id}`,
        description: refundData.reason.trim(),
        paymentMethod: sale.payment.method,
        user: userId,
        company: companyId,
        cashRegister: refundShift.cashRegister,
        saleReference: sale._id,
        shift: refundShift._id,
        authorized: true,
        authorizedBy: userId
      }], { session });

      if (sale.couponId) {
        await Coupon.updateOne(
          { _id: sale.couponId, company: companyId },
          { $pull: { usageHistory: { saleId: sale._id } } },
          { session }
        );
      }

      await Model.updateOne(
        { saleId: sale._id, ticketType: 'sale', company: companyId },
        { $set: { status: 'refunded' } },
        { session }
      );

      const paymentMethods = {
        cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', mixed: 'mixto'
      };
      [refundTicket] = await Model.create([{
        ticketNumber: `REFUND-${sale._id}`,
        ticketType: 'refund',
        saleId: sale._id,
        company: companyId,
        transactionInfo: {
          date: new Date(),
          cashRegister: refundShift.cashRegister,
          cashier: { id: userId }
        },
        items: sale.products.map(item => ({
          productId: item.productId,
          productName: item.priceSnapshot.name,
          quantity: item.quantity,
          unitPrice: item.priceSnapshot.price,
          totalTaxes: item.taxAmount,
          totalPrice: item.total,
          variant: item.variantId ? { id: item.variantId, name: item.variantName } : undefined
        })),
        totals: {
          subtotal: sale.subtotal,
          totalTaxes: sale.totalTaxes,
          discounts: sale.couponDiscount,
          total: sale.finalTotal
        },
        payment: { method: paymentMethods[sale.payment.method] },
        notes: refundData.reason.trim()
      }], { session });
    });

    return { success: true, ticket: refundTicket, message: 'Refund completed' };
  } catch (error) {
    console.error('Error processing refund:', error);
    throw error;
  } finally {
    await session.endSession();
  }
}

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
  __storeConfigUtils: {
    formatCompanyAddress,
    mapCompanyToStoreConfig,
    normalizeStoreConfigInput,
    DEFAULT_STORE_CONFIG,
  },
  processSaleTicket,
  processRefundTicket,
  createTicketFromSaleWithTaxes,
  processSaleTicketWithTaxes,
  processSaleTicketWithCoupon,
  getTicketsByDateRange,
  generateTicketPDFFromSale
};
