const PDFDocument = require('pdfkit');
const Model = require('./model');
const SalesModel = require('../sales/model');
const UsersModel = require('../users/model');

// CREAR CORTE
async function createCashRegisterCut(cutData) {
  // Validar admin
  const admin = await UsersModel.findById(cutData.administratorId);
  if (!admin?.privileges?.full) throw new Error('User does not have administrator privileges');

  // Validar cajero
  const cashier = await UsersModel.findById(cutData.cashierId);
  if (!cashier) throw new Error('Cashier not found');

  // Generar número de corte
  const cutNumber = await Model.generateCutNumber(cutData.cashRegister || 'CAJA-1');

  // Buscar ventas del turno
  const sales = await SalesModel.find({
    cashRegister: cutData.cashRegister,
    createdBy: cutData.cashierId,
    createdAt: { $gte: new Date(cutData.shiftStart), $lte: new Date(cutData.shiftEnd) },
    disable: false
  });

  // Calcular resumen
  const salesSummary = {
    totalSales: 0, totalRefunds: 0, netSales: 0,
    cash: { sales: 0, refunds: 0, net: 0 },
    card: { sales: 0, refunds: 0, net: 0 },
    mixed: { sales: 0, refunds: 0, net: 0 },
    salesCount: 0, refundsCount: 0,
    salesIds: sales.map(s => s._id) // eslint-disable-line no-underscore-dangle
  };

  // Procesar ventas
  sales.forEach(sale => {
    const isRefund = sale.status === 'cancelled' || sale.refund;
    const amount = sale.total || 0;
    
    if (isRefund) {
      salesSummary.refundsCount += 1;
      if (salesSummary[sale.paymentMethod]) salesSummary[sale.paymentMethod].refunds += amount;
    } else {
      salesSummary.salesCount += 1;
      if (salesSummary[sale.paymentMethod]) salesSummary[sale.paymentMethod].sales += amount;
    }
  });

  // Calcular netos
  ['cash', 'card', 'mixed'].forEach(method => {
    salesSummary[method].net = salesSummary[method].sales - salesSummary[method].refunds;
    salesSummary.totalSales += salesSummary[method].sales;
    salesSummary.totalRefunds += salesSummary[method].refunds;
  });
  salesSummary.netSales = salesSummary.totalSales - salesSummary.totalRefunds;

  // Crear corte
  const newCut = new Model({
    cutNumber,
    cashRegister: cutData.cashRegister || 'CAJA-1',
    cashier: cutData.cashierId,
    administrator: cutData.administratorId,
    shiftStart: new Date(cutData.shiftStart),
    shiftEnd: new Date(cutData.shiftEnd),
    salesSummary,
    cashControl: {
      expectedCash: salesSummary.cash.net + (cutData.initialCash || 0),
      actualCash: cutData.actualCash || 0,
      difference: (cutData.actualCash || 0) - (salesSummary.cash.net + (cutData.initialCash || 0)),
      initialCash: cutData.initialCash || 0
    },
    notes: cutData.notes,
    company: cutData.companyId,
    status: 'closed'
  });

  const savedCut = await newCut.save();
  return {
    success: true,
    cut: {
      id: savedCut._id, // eslint-disable-line no-underscore-dangle
      cutNumber: savedCut.cutNumber,
      total: savedCut.salesSummary.netSales,
      difference: savedCut.cashControl.difference
    },
    message: `Cut ${cutNumber} created successfully`
  };
}

async function getCashRegisterCuts(filters = {}) {
  const query = { disable: false };

  if (filters.cashRegister) query.cashRegister = filters.cashRegister;
  if (filters.cashierId) query.cashier = filters.cashierId;
  if (filters.date) {
    const startDate = new Date(filters.date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(filters.date);
    endDate.setHours(23, 59, 59, 999);
    query.cutDate = { $gte: startDate, $lte: endDate };
  }
  if (filters.companyId && filters.companyId !== 'default-company-id') {
    query.company = filters.companyId;
  }

  const cuts = await Model.find(query)
    .populate('cashier', 'userName name')
    .populate('administrator', 'userName name')
    .sort({ cutDate: -1 })
    .limit(filters.limit || 50);

  return { cuts, count: cuts.length, filters };
}

async function getCashRegisterCutById(cutId) {
  const cut = await Model.findById(cutId)
    .populate('cashier', 'userName name')
    .populate('administrator', 'userName name');
  if (!cut) throw new Error('Cut not found');
  return cut;
}
async function generateCutPDFDirect(cutId, res) {
  const cut = await Model.findById(cutId);
  if (!cut) throw new Error('Cut not found');

  const [cashierData, adminData] = await Promise.all([
    UsersModel.findById(cut.cashier).select('userName name'),
    UsersModel.findById(cut.administrator).select('userName name')
  ]);

  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="corte-${cutId}.pdf"`);
  doc.pipe(res);

  // Contenido del PDF
  doc.fontSize(18).text('CORTE DE CAJA', { align: 'center' });
  doc.fontSize(12).text('Mi Tienda POS', { align: 'center' });
  doc.moveDown(2);

  doc.text(`Corte: ${cut.cutNumber}`);
  doc.text(`Caja: ${cut.cashRegister}`);
  doc.text(`Fecha: ${cut.cutDate.toLocaleDateString('es-MX')}`);
  doc.text(`Cajero: ${cashierData?.name || 'N/A'}`);
  doc.text(`Admin: ${adminData?.name || 'N/A'}`);
  doc.moveDown();

  doc.text(`Turno: ${cut.shiftStart.toLocaleString('es-MX')} - ${cut.shiftEnd.toLocaleString('es-MX')}`);
  doc.moveDown();

  doc.fontSize(14).text('RESUMEN DE VENTAS:');
  doc.fontSize(12);
  doc.text(`Efectivo: ${(cut.salesSummary.cash.net || 0).toLocaleString()}`);
  doc.text(`Tarjeta: ${(cut.salesSummary.card.net || 0).toLocaleString()}`);
  doc.text(`Total: ${(cut.salesSummary.netSales || 0).toLocaleString()}`);
  doc.text(`Ventas: ${cut.salesSummary.salesCount || 0}`);
  doc.moveDown();

  doc.fontSize(14).text('CONTROL DE EFECTIVO:');
  doc.fontSize(12);
  doc.text(`Inicial: ${(cut.cashControl.initialCash || 0).toLocaleString()}`);
  doc.text(`Esperado: ${(cut.cashControl.expectedCash || 0).toLocaleString()}`);
  doc.text(`Contado: ${(cut.cashControl.actualCash || 0).toLocaleString()}`);
  
  const diff = cut.cashControl.difference || 0;
  if (diff > 0) {
    doc.text(`Diferencia: +${diff.toLocaleString()} (SOBRANTE)`);
  } else if (diff < 0) {
    doc.text(`Diferencia: -${Math.abs(diff).toLocaleString()} (FALTANTE)`);
  } else {
    doc.text(`Diferencia: ${diff.toLocaleString()}`);
  }
  doc.moveDown();

  if (cut.notes) {
    doc.text(`Observaciones: ${cut.notes}`);
    doc.moveDown();
  }

  doc.moveDown(2);
  doc.text('______________________     ______________________');
  doc.text('  Firma del Cajero            Firma del Admin');
  doc.moveDown();
  doc.fontSize(8).text(`Generado: ${new Date().toLocaleString('es-MX')}`);

  doc.end();
}

async function generateCashRegisterReport(filters = {}) {
  const { cuts } = await getCashRegisterCuts(filters);
  const summary = cuts.reduce((acc, cut) => ({
    totalCuts: acc.totalCuts + 1,
    totalSales: acc.totalSales + (cut.salesSummary.netSales || 0),
    totalDifferences: acc.totalDifferences + (cut.cashControl.difference || 0)
  }), { totalCuts: 0, totalSales: 0, totalDifferences: 0 });

  return { summary, cuts, filters };
}

module.exports = {
  createCashRegisterCut,
  getCashRegisterCuts,
  getCashRegisterCutById,
  generateCutPDFDirect, 
  generateCashRegisterReport,
  getDailyCashRegisterReport: (date, companyId) => generateCashRegisterReport({ date, companyId }),
  getUserCashRegisterReport: (userId, startDate, endDate, companyId) => 
    generateCashRegisterReport({ cashierId: userId, startDate, endDate, companyId }),
  getCashRegisterReport: (cashRegister, startDate, endDate, companyId) => 
    generateCashRegisterReport({ cashRegister, startDate, endDate, companyId })
};