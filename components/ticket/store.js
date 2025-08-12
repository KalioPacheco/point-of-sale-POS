const PDFDocument = require('pdfkit');
const Model = require('./model');
const SalesModel = require('../sales/model');
const CashRegisterCutsModel = require('../cashRegisterCuts/model');
const UsersModel = require('../users/model');
const CompaniesModel = require('../companies/model');

let storeConfig = {
  name: 'Nombre de la Empresa',
  address: 'Dirección de la Empresa',
  phone: '',
  taxId: '',
  email: ''
};

const getCompany = async (companyId) => {
  if (!companyId || companyId === 'default-company-id') return null;
  try {
    return await CompaniesModel.findById(companyId);
  } catch {
    return null;
  }
};

async function getStoreInfo(companyId) {
  try {
    const company = await getCompany(companyId);
    
    if (company?.name && 
        company.name !== 'Nombre de la Empresa' && 
        company.name.trim() !== '') {
      return {
        name: company.name,
        address: company.address || 'Dirección de la Empresa',
        phone: company.phone || '',
        taxId: company.taxId || '',
        email: company.email || ''
      };
    }
    
    return { ...storeConfig };
    
  } catch (error) {
    console.error('Error getting store info:', error);
    return { ...storeConfig };
  }
}

async function updateStoreInfo(storeInfo, companyId) {
  try {
    storeConfig = {
      name: storeInfo.name || storeConfig.name,
      address: storeInfo.address || storeConfig.address,
      phone: storeInfo.phone || storeConfig.phone,
      taxId: storeInfo.taxId || storeConfig.taxId,
      email: storeInfo.email || storeConfig.email
    };

    const company = await getCompany(companyId);
    if (company) {
      Object.assign(company, storeInfo);
      await company.save().catch(() => console.log('Company save failed'));
    }

    return {
      success: true,
      message: 'Store updated',
      storeInfo: { ...storeConfig }
    };

  } catch (error) {
    console.error('Error updating store:', error);
    throw error;
  }
}

async function createTicket(ticketData) {
  try {
    const ticketNumber = await Model.generateTicketNumber(
      ticketData.ticketType,
      ticketData.transactionInfo?.cashRegister || 'CAJA-1'
    );

    const storeInfo = ticketData.storeInfo?.name && 
      ticketData.storeInfo.name !== 'Nombre de la Empresa' 
      ? ticketData.storeInfo 
      : await getStoreInfo(ticketData.companyId);

    const newTicket = new Model({
      ticketNumber,
      ticketType: ticketData.ticketType,
      saleId: ticketData.saleId,
      cutId: ticketData.cutId,
      storeInfo,
      transactionInfo: ticketData.transactionInfo || {},
      items: ticketData.items || [],
      totals: ticketData.totals || {},
      payment: ticketData.payment || {},
      format: ticketData.format || {},
      notes: ticketData.notes,
      company: ticketData.companyId,

      taxBreakdown: ticketData.taxBreakdown || []
    });

    newTicket.calculateTotals();
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
        taxBreakdown: savedTicket.taxBreakdown
      },
      message: `Ticket ${ticketNumber} created`
    };

  } catch (error) {
    console.error('Error creating ticket:', error);
    throw error;
  }
}

async function createTicketFromSaleWithTaxes(saleId, userId, companyId) {
  try {
    const sale = await SalesModel.findById(saleId)
      .populate('itemsPOS.product', 'name')
      .populate('createdBy', 'userName name');

    if (!sale) throw new Error('Sale not found');

    const storeInfo = await getStoreInfo(companyId);
    
    const items = sale.itemsPOS?.length > 0 
      ? sale.itemsPOS.map(item => ({
          productId: item.product?.id || item.product,
          productName: item.productName || item.product?.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.unitPrice * item.quantity,
          totalPrice: item.totalPrice,
          variant: item.variant,
          taxes: item.taxes || [],
          totalTaxes: item.totalTaxes || 0
        }))
      : [{
          productName: 'Venta',
          quantity: 1,
          unitPrice: sale.total,
          subtotal: sale.total,
          totalPrice: sale.total,
          taxes: [],
          totalTaxes: 0
        }];

    return createTicket({
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
        subtotal: sale.subtotal || sale.total,
        totalTaxes: sale.totalTaxes || 0,
        total: sale.total
      },
      payment: {
        method: sale.paymentMethod || 'efectivo',
        details: sale.paymentDetails || {}
      },
      taxBreakdown: sale.taxBreakdown || [],
      companyId
    });

  } catch (error) {
    console.error('Error creating ticket from sale with taxes:', error);
    throw error;
  }
}

async function createTicketFromSale(saleId, userId, companyId) {
  try {
    const sale = await SalesModel.findById(saleId)
      .populate('itemsPOS.product', 'name')
      .populate('createdBy', 'userName name');

    if (!sale) throw new Error('Sale not found');

    const storeInfo = await getStoreInfo(companyId);
    const items = sale.itemsPOS?.length > 0 
      ? sale.itemsPOS.map(item => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          variant: item.variant
        }))
      : [{
          productName: 'Venta',
          quantity: 1,
          unitPrice: sale.total,
          totalPrice: sale.total
        }];

    return createTicket({
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
        subtotal: sale.subtotal || sale.total,
        taxes: sale.taxes || 0,
        total: sale.total
      },
      payment: {
        method: sale.paymentMethod || 'efectivo',
        details: sale.paymentDetails || {}
      },
      companyId
    });

  } catch (error) {
    console.error('Error creating ticket from sale:', error);
    throw error;
  }
}

async function createTicketFromCut(cutId, _nusedUserId, companyId) {
  try {
    const cut = await CashRegisterCutsModel.findById(cutId)
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

    if (filters.ticketType) query.ticketType = filters.ticketType;
    if (filters.cashRegister) query['transactionInfo.cashRegister'] = filters.cashRegister;
    if (filters.companyId && filters.companyId !== 'default-company-id') {
      query.company = filters.companyId;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
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

    const data = {
      storeName: ticket.storeInfo.name,
      storeAddress: ticket.storeInfo.address,
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
      discounts: ticket.totals.discounts,
      total: ticket.totals.total,
      taxBreakdown: ticket.taxBreakdown || [],
      paymentMethod: ticket.payment.method,
      cashReceived: ticket.payment.details?.cashReceived,
      change: ticket.payment.details?.change,
      cashAmount: ticket.payment.details?.cashAmount,
      cardAmount: ticket.payment.details?.cardAmount,
      customerName: ticket.transactionInfo.customer?.name,
      notes: ticket.notes
    };

    if (!ticket.printInfo.printed) {
      await ticket.markAsPrinted();
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
    doc.moveDown(0.5);
    doc.fontSize(8).text(`${data.ticketNumber}          ${data.date} ${data.time}`, { align: 'center' });
    doc.moveDown(0.8);
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
    if (data.taxBreakdown && data.taxBreakdown.length > 0 && data.totalTaxes > 0) {
      doc.fontSize(8);
      doc.text('IMPUESTOS:');
      doc.fontSize(7);
      
      data.taxBreakdown.forEach(tax => {
        doc.text(`${tax.name}:`, 10, doc.y, { width: width - 80 });
        doc.text(`$${tax.totalAmount.toFixed(2)}`, width - 70, doc.y - 10, { width: 60, align: 'right' });
        doc.moveDown(0.2);
      });
      
      doc.text('--------------------------------');
      doc.moveDown(0.3);
    }

    if (data.subtotal && data.totalTaxes > 0) {
      doc.fontSize(8);
      doc.text('SUBTOTAL:', 10, doc.y, { width: width - 80 });
      doc.text(`$${data.subtotal.toFixed(2)}`, width - 70, doc.y - 10, { width: 60, align: 'right' });
      doc.moveDown(0.3);
      
      doc.text('IMPUESTOS:', 10, doc.y, { width: width - 80 });
      doc.text(`$${data.totalTaxes.toFixed(2)}`, width - 70, doc.y - 10, { width: 60, align: 'right' });
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

async function cancelTicket(ticketId, reason, _unusedUserId) {
  try {
    const ticket = await Model.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

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


async function processSaleTicket(saleData, userId, companyId) {
  try {
    const storeInfo = await getStoreInfo(companyId);
    const user = await UsersModel.findById(userId);
    
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
      totals: {
        subtotal: saleData.subtotal || 0,
        taxes: saleData.taxes || 0,
        discounts: saleData.discounts || 0,
        total: saleData.total || 0
      },
      payment: {
        method: saleData.paymentMethod || 'efectivo',
        details: saleData.paymentDetails || {}
      },
      notes: saleData.notes,
      companyId
    });
  } catch (error) {
    console.error('Error processing sale:', error);
    throw error;
  }
}

async function processSaleTicketWithTaxes(saleData, userId, companyId) {
  try {
    const storeInfo = await getStoreInfo(companyId);
    const user = await UsersModel.findById(userId);
    
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
      totals: {
        subtotal: saleData.subtotal || 0,
        totalTaxes: saleData.totalTaxes || 0, 
        taxes: saleData.taxes || saleData.totalTaxes || 0,
        discounts: saleData.discounts || 0,
        total: saleData.total || 0
      },
      payment: {
        method: saleData.paymentMethod || 'efectivo',
        details: saleData.paymentDetails || {}
      },
   
      taxBreakdown: saleData.taxBreakdown || [],
      notes: saleData.notes,
      companyId
    });
  } catch (error) {
    console.error('Error processing sale with taxes:', error);
    throw error;
  }
}

async function processRefundTicket(refundData, userId, companyId) {
  try {
    const sale = await SalesModel.findById(refundData.originalSaleId);
    if (!sale) throw new Error('Sale not found');

    const storeInfo = await getStoreInfo(companyId);
    const user = await UsersModel.findById(userId);

    return createTicket({
      ticketType: 'refund',
      saleId: sale.id,
      storeInfo,
      transactionInfo: {
        date: new Date(),
        cashRegister: refundData.cashRegister || 'CAJA-1',
        cashier: {
          id: userId,
          name: user?.name || user?.userName || 'Cajero'
        }
      },
      items: refundData.items || [],
      totals: { 
        total: refundData.refundAmount || 0,
        subtotal: refundData.refundAmount || 0,
        totalTaxes: 0 
      },
      payment: { method: 'efectivo' },
      notes: `Reembolso: ${sale.saleNumber || sale.id} | ${refundData.reason || 'N/A'}`,
      companyId
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    throw error;
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
  processSaleTicket,
  processRefundTicket,
  createTicketFromSaleWithTaxes,
  processSaleTicketWithTaxes,
  getTicketsByDateRange
};