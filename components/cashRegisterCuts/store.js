const PDFDocument = require('pdfkit');
const Model = require('./model');
const UsersModel = require('../users/model');
const CashRegisterShift = require('../cashRegisterShifts/model');


async function createCashRegisterCut(cutData) {
  const session = await Model.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const admin = await UsersModel.findOne({
        _id: cutData.administratorId, company: cutData.companyId, disable: false
      }).session(session);
      if (!admin || !['admin', 'manager'].includes(admin.role)) {
        throw new Error('User does not have administrator privileges');
      }
      // Checkout, refunds and shift-bound movement creation share this write fence.
      const shift = await CashRegisterShift.findOneAndUpdate({
        _id: cutData.shiftId, company: cutData.companyId, cashRegister: cutData.cashRegister
      }, { $inc: { operationRevision: 1 } }, { new: true, session });
      if (!shift) throw new Error('Shift pending cut not found for this cash register');

      const existing = await Model.findOne({
        company: cutData.companyId, shift: cutData.shiftId, disable: false
      }).session(session);
      if (shift.cutStatus === 'completed') {
        if (!existing || String(shift.cut) !== String(existing._id)) {
          throw new Error('Cut conflict: completed shift has an inconsistent cut reference');
        }
        result = { success: true, cut: existing, message: 'Cut already completed' };
        return;
      }
      const actualCash = shift.status === 'closed' ? shift.closingCash : cutData.actualCash;
      if (!Number.isFinite(actualCash) || actualCash < 0) {
        throw new Error('Actual cash is required to complete the cut');
      }
      const cashier = await UsersModel.findOne({
        _id: shift.cashier, company: cutData.companyId, disable: false
      }).session(session);
      if (!cashier) throw new Error('Cashier not found');

      const cutNumber = existing?.cutNumber ||
        await Model.generateCutNumber(cutData.cashRegister, cutData.companyId, session);
      // Recalculate legacy partial cuts instead of trusting their possibly stale snapshot.
      const cut = existing || new Model();
      cut.set({
        cutNumber, cashRegister: cutData.cashRegister, cashier: shift.cashier,
        administrator: cutData.administratorId, shift: shift._id,
        shiftStart: shift.openedAt, shiftEnd: shift.closedAt || new Date(),
        salesSummary: new Model().salesSummary.toObject(),
        cashControl: { expectedCash: 0, actualCash, difference: 0, initialCash: shift.openingCash },
        notes: cutData.notes ?? cut.notes, company: cutData.companyId, status: 'closed'
      });
      await cut.calculateTaxes(session);
      cut.cashControl.expectedCash = cut.salesSummary.cash.net +
        cut.salesSummary.mixed.cashNet + shift.openingCash +
        (cut.cashControl.totalMovements || 0);
      cut.cashControl.difference = actualCash - cut.cashControl.expectedCash;
      await cut.save({ session });
      shift.status = 'closed';
      shift.closingCash = actualCash;
      shift.closedAt = shift.closedAt || cut.shiftEnd;
      shift.cutStatus = 'completed';
      shift.cut = cut._id;
      await shift.save({ session });
      result = { success: true, cut, message: `Cut ${cutNumber} created successfully` };
    });
  } finally {
    await session.endSession();
  }
  return result;
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
