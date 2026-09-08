const store = require('./store');

const validateCutData = (cutData) => {
  if (!cutData.cashRegister) throw new Error('Cash register required');
  if (!cutData.shiftId) throw new Error('Shift ID required');
  if (!cutData.administratorId) throw new Error('Administrator ID required');
  if (cutData.actualCash !== undefined && cutData.actualCash < 0) {
    throw new Error('Actual cash cannot be negative');
  }
};

module.exports = {
  createCashRegisterCut(cutData) {
    validateCutData(cutData);
    return store.createCashRegisterCut(cutData);
  },
  getCashRegisterCuts: (filters) => store.getCashRegisterCuts(filters),
  getCashRegisterCutById: (cutId) => store.getCashRegisterCutById(cutId),
  generateCashRegisterReport: (filters) => store.generateCashRegisterReport(filters),
  getDailyCashRegisterReport: store.getDailyCashRegisterReport,
  getUserCashRegisterReport: store.getUserCashRegisterReport,
  getCashRegisterReport: store.getCashRegisterReport
};
