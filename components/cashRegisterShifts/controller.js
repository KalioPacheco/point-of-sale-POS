const store = require('./store');

function openShift(data) {
  if (!data.companyId || !data.cashierId) throw new Error('Company and cashier are required');
  if (!data.cashRegister) throw new Error('Cash register is required');
  if (!Number.isFinite(data.openingCash) || data.openingCash < 0) {
    throw new Error('Opening cash must be zero or greater');
  }
  return store.openShift(data);
}

module.exports = {
  openShift,
  getCurrentShift(companyId, cashRegister, cashierId, cashRegisterContext) {
    return store.getCurrentShift(companyId, cashRegister, cashierId, cashRegisterContext);
  },
  closeShift(shiftId, companyId, closingCash, notes, actorId, actorRole) {
    if (!Number.isFinite(closingCash) || closingCash < 0) {
      throw new Error('Closing cash must be zero or greater');
    }
    return store.closeShift(
      shiftId,
      companyId,
      closingCash,
      notes,
      actorId,
      actorRole
    );
  },
  listPendingCuts: store.listPendingCuts
};
