const PDFDocument = require('pdfkit');
const Model = require('./model');
const UsersModel = require('../users/model');
const CashRegisterShift = require('../cashRegisterShifts/model');


async function createCashRegisterCut(cutData) {
  const shift = await CashRegisterShift.findOne({
    _id: cutData.shiftId,
    company: cutData.companyId,
    cashRegister: cutData.cashRegister,
    status: { $in: ['open', 'closed'] },
    cutStatus: { $ne: 'completed' }
  });
  if (!shift) throw new Error('Shift pending cut not found for this cash register');
  cutData.cashierId = shift.cashier;
  const actualCash = shift.status === 'closed' ? shift.closingCash : cutData.actualCash;
  if (!Number.isFinite(actualCash) || actualCash < 0) {
    throw new Error('Actual cash is required to complete the cut');
  }
  
// 🔒 VALIDAR SI YA EXISTE CORTE HOY

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

const todayEnd = new Date();
todayEnd.setHours(23, 59, 59, 999);

const existingCut = await Model.findOne({
  cashRegister: cutData.cashRegister,
  company: cutData.companyId,
  shift: cutData.shiftId,
  disable: false
});

if (existingCut) {
  throw new Error('Ya existe un corte de caja para hoy en esta caja');
}

  const admin = await UsersModel.findOne({
    _id: cutData.administratorId,
    company: cutData.companyId,
    disable: false
  });
  if (!admin || !['admin', 'manager'].includes(admin.role)) {
    throw new Error('User does not have administrator privileges');
  }

 
  const cashier = await UsersModel.findOne({
    _id: cutData.cashierId,
    company: cutData.companyId,
    disable: false
  });
  if (!cashier) throw new Error('Cashier not found');

 
  const cutNumber = await Model.generateCutNumber(cutData.cashRegister || 'CAJA', cutData.companyId);
  const newCut = new Model({
    cutNumber,
    cashRegister: cutData.cashRegister || 'CAJA',
    cashier: cutData.cashierId,
    administrator: cutData.administratorId,
    shift: cutData.shiftId,
    shiftStart: shift.openedAt,
    shiftEnd: new Date(),
    salesSummary: {
      totalSales: 0, totalRefunds: 0, netSales: 0,
      cash: { sales: 0, refunds: 0, net: 0 },
      card: { sales: 0, refunds: 0, net: 0 },
      transfer: { sales: 0, refunds: 0, net: 0 },
      mixed: { sales: 0, refunds: 0, net: 0 },
      salesCount: 0, refundsCount: 0,
      salesIds: []
    },
    cashControl: {
      expectedCash: actualCash,
      actualCash,
      difference: 0,
      initialCash: shift.openingCash
    },
    notes: cutData.notes,
    company: cutData.companyId,
    status: 'closed'
  });

  console.log('Calculando ventas para el corte...');
  
  await newCut.calculateTaxes();

  newCut.cashControl.expectedCash = newCut.salesSummary.cash.net +
    newCut.salesSummary.mixed.cashNet + shift.openingCash +
    (newCut.cashControl.totalMovements || 0);
  newCut.cashControl.actualCash = actualCash;
  newCut.cashControl.difference = newCut.cashControl.actualCash - newCut.cashControl.expectedCash;

  const savedCut = await newCut.save();
  shift.status = 'closed';
  shift.closingCash = actualCash;
  shift.closedAt = shift.closedAt || new Date();
  shift.cutStatus = 'completed';
  shift.cut = savedCut._id;
  await shift.save();
  
  console.log(`Corte creado: ${savedCut.cutNumber}`);
  console.log(`Total de ventas: $${savedCut.salesSummary.netSales}`);
  console.log(`Cantidad de ventas: ${savedCut.salesSummary.salesCount}`);

  return {
    success: true,
    cut: savedCut,
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
  doc.text('  Firma del Cajero            Firma del manager ');
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
