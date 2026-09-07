const Shift = require('../cashRegisterShifts/model');
const Cut = require('../cashRegisterCuts/model');
const Movement = require('./model');

const round = value => Math.round((value + Number.EPSILON) * 100) / 100;

async function getShiftLedger({ shiftId, companyId, userId, role, page = 0, limit = 25 }) {
  const session = await Shift.db.startSession();
  let result;
  try {
    // Summary and page share one database snapshot, including concurrent checkout/refund writes.
    await session.withTransaction(async () => {
      const filter = { _id: shiftId, company: companyId };
      if (role === 'vendedor') filter.cashier = userId;
      const shift = await Shift.findOne(filter).session(session);
      if (!shift) throw new Error('Shift not found');
      const preview = new Cut({ company: companyId, shift: shift._id, cashRegister: shift.cashRegister });
      await preview.calculateTaxes(session);
      const { cash, mixed } = preview.salesSummary;
      const income = round(cash.sales + mixed.cashSales + preview.cashControl.movementsBreakdown.income);
      const expenses = round(cash.refunds + mixed.cashRefunds + preview.cashControl.movementsBreakdown.expenses);
      const query = {
        company: companyId,
        shift: shift._id,
        cashRegister: shift.cashRegister,
        disable: false,
        approvalStatus: { $nin: ['pending', 'rejected'] }
      };
      const total = await Movement.countDocuments(query).session(session);
      const movements = await Movement.find(query).session(session)
        .populate('user', 'name lastNames userName').populate('saleReference', 'payment')
        .sort({ createdAt: -1, _id: -1 }).skip(page * limit).limit(limit);
      result = { movements, total, page, limit, summary: {
        shiftId: String(shift._id), openingCash: shift.openingCash, income, expenses,
        expectedCash: round(shift.openingCash + income - expenses)
      } };
    }, { readConcern: { level: 'snapshot' } });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { getShiftLedger };
