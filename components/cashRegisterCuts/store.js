const mongoose = require('mongoose');
const { pageOptions, dateRange } = require('../../helpers/query');
const PDFDocument = require('pdfkit');
const Model = require('./model');
const UsersModel = require('../users/model');
const Company = require('../companies/model');
const CashRegisterShift = require('../cashRegisterShifts/model');
const Branch = require('../branches/model');
const { applyBranchScope } = require('../../helpers/branchScope');

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;


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
        _id: cutData.shiftId, company: cutData.companyId, cashRegister: cutData.cashRegister,
        ...(cutData.branchId ? { branch: cutData.branchId } : {}),
        ...(cutData.cashRegisterId ? { cashRegisterId: cutData.cashRegisterId } : {})
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
      const company = await Company.findById(cutData.companyId).session(session).select('name').lean();
      cut.set({
        companyName: existing?.companyName || company?.name,
        cutNumber, cashRegister: cutData.cashRegister, cashRegisterId: shift.cashRegisterId,
        branch: shift.branch, cashier: shift.cashier,
        administrator: cutData.administratorId, shift: shift._id,
        shiftStart: shift.openedAt, shiftEnd: shift.closedAt || new Date(),
        salesSummary: new Model().salesSummary.toObject(),
        cashControl: { expectedCash: 0, actualCash, difference: 0, initialCash: shift.openingCash },
        differenceApproval: { status: 'not_required' },
        notes: cutData.notes ?? cut.notes, company: cutData.companyId, status: 'closed'
      });
      await cut.calculateTaxes(session);
      cut.cashControl.expectedCash = cut.salesSummary.cash.net +
        cut.salesSummary.mixed.cashNet + shift.openingCash +
        (cut.cashControl.totalMovements || 0);
      cut.cashControl.difference = roundMoney(actualCash - cut.cashControl.expectedCash);
      if (cut.cashControl.difference !== 0) {
        const reason = cutData.differenceReason?.trim();
        if (!reason) {
          throw new Error('A difference reason is required to approve a cash cut with a variance');
        }
        cut.differenceApproval = {
          status: 'approved',
          reason,
          reviewedBy: cutData.administratorId,
          reviewedAt: new Date()
        };
      }
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

function cutQuery(filters) {
  if (!mongoose.Types.ObjectId.isValid(filters.companyId)) throw new Error('Company required');
  const query = { disable: false, company: new mongoose.Types.ObjectId(filters.companyId) };
  if (filters.cashRegister) query.cashRegister = filters.cashRegister;
  if (Array.isArray(filters.branchIds)) {
    applyBranchScope(query, 'branch', filters.branchIds.map(id => new mongoose.Types.ObjectId(id)));
  }
  if (filters.cashierId) {
    if (!mongoose.Types.ObjectId.isValid(filters.cashierId)) throw new Error('Invalid cashier ID');
    query.cashier = new mongoose.Types.ObjectId(filters.cashierId);
  }
  const range = dateRange(filters);
  if (range) query.cutDate = range;
  return query;
}

async function generateCashRegisterReport(filters = {}) {
  const { page, limit, skip } = pageOptions(filters);
  const [result] = await Model.aggregate([
    { $match: cutQuery(filters) },
    { $sort: { cutDate: -1, _id: -1 } },
    { $facet: {
      cuts: [{ $skip: skip }, { $limit: limit }],
      summary: [{ $group: {
        _id: null, totalCuts: { $sum: 1 },
        totalSales: { $sum: '$salesSummary.netSales' },
        totalDifferences: { $sum: '$cashControl.difference' }
      } }]
    } }
  ]);
  const summary = result.summary[0] || { totalCuts: 0, totalSales: 0, totalDifferences: 0 };
  delete summary._id;
  const cuts = await Model.populate(result.cuts, [
    { path: 'branch', select: 'code name address' },
    { path: 'cashRegisterId', select: 'code name' },
    { path: 'cashier', select: 'userName name' },
    { path: 'administrator', select: 'userName name' },
    { path: 'differenceApproval.reviewedBy', select: 'userName name' }
  ]);
  return { summary, cuts, count: cuts.length, total: summary.totalCuts, page, limit, filters };
}

async function getCashRegisterCuts(filters = {}) {
  return generateCashRegisterReport(filters);
}

async function getCashRegisterCutById(cutId) {
  const cut = await Model.findById(cutId)
    .populate('cashier', 'userName name')
    .populate('administrator', 'userName name')
    .populate('differenceApproval.reviewedBy', 'userName name');
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
  const company = cut.companyName ? null : await Company.findById(cut.company).select('name').lean();
  doc.fontSize(12).text(cut.companyName || company?.name || 'Empresa no disponible', { align: 'center' });
  doc.moveDown(2);

  doc.text(`Corte: ${cut.cutNumber}`);
  doc.text(`Caja: ${cut.cashRegister}`);
  if (cut.branch) {
    const branch = await Branch.findOne({ _id: cut.branch, company: cut.company }).select('name address').lean();
    if (branch) {
      doc.text(`Sucursal: ${branch.name}`);
      const address = [branch.address?.street, branch.address?.city, branch.address?.state,
        branch.address?.country, branch.address?.postalCode].filter(Boolean).join(', ');
      if (address) doc.text(address);
    }
  }
  doc.text(`Fecha: ${cut.cutDate.toLocaleDateString('es-MX')}`);
  doc.text(`Cajero: ${cashierData?.name || cashierData?.userName || 'N/A'}`);
  doc.text(`Admin: ${adminData?.name || adminData?.userName || 'N/A'}`);
  doc.moveDown();

  doc.text(`Turno: ${cut.shiftStart.toLocaleString('es-MX')} - ${cut.shiftEnd.toLocaleString('es-MX')}`);
  doc.moveDown();

  doc.fontSize(14).text('RESUMEN DE VENTAS:');
  doc.fontSize(12);
  const money = value => `$${Number(value || 0).toFixed(2)}`;
  [['cash', 'Efectivo'], ['card', 'Tarjeta'], ['transfer', 'Transferencia'], ['mixed', 'Mixto']].forEach(([method, label]) => {
    const amounts = cut.salesSummary[method];
    doc.text(`${label}: ventas ${money(amounts.sales)} - devoluciones ${money(amounts.refunds)} = ${money(amounts.net)}`);
  });
  doc.text(`Mixto / efectivo neto: ${money(cut.salesSummary.mixed.cashNet)}`);
  doc.text(`Mixto / tarjeta neta: ${money(cut.salesSummary.mixed.cardNet)}`);
  doc.text(`Ventas brutas: ${money(cut.salesSummary.totalSales)}`);
  doc.text(`Devoluciones: ${money(cut.salesSummary.totalRefunds)}`);
  doc.text(`Total neto: ${money(cut.salesSummary.netSales)}`);
  doc.text(`Ventas: ${cut.salesSummary.salesCount || 0}`);
  doc.text(`Numero de devoluciones: ${cut.salesSummary.refundsCount || 0}`);
  doc.moveDown();

  doc.fontSize(14).text('CONTROL DE EFECTIVO:');
  doc.fontSize(12);
  doc.text(`Inicial: ${(cut.cashControl.initialCash || 0).toLocaleString()}`);
  doc.text(`Entradas manuales: ${money(cut.cashControl.movementsBreakdown?.income)}`);
  doc.text(`Salidas manuales: ${money(cut.cashControl.movementsBreakdown?.expenses)}`);
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

module.exports = {
  createCashRegisterCut,
  getCashRegisterCuts,
  getCashRegisterCutById,
  generateCutPDFDirect, 
  generateCashRegisterReport,
  getDailyCashRegisterReport: (date, companyId, branchIds) => generateCashRegisterReport({ date, companyId, branchIds }),
  getUserCashRegisterReport: (userId, startDate, endDate, companyId, branchIds) =>
    generateCashRegisterReport({ cashierId: userId, startDate, endDate, companyId, branchIds }),
  getCashRegisterReport: (cashRegister, startDate, endDate, companyId, branchIds) =>
    generateCashRegisterReport({ cashRegister, startDate, endDate, companyId, branchIds })
};
