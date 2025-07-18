const store = require('./store');

// Validaciones
const validateCutData = (cutData) => {
  if (!cutData.cashRegister) throw new Error('Cash register required');
  if (!cutData.cashierId) throw new Error('Cashier ID required');
  if (!cutData.administratorId) throw new Error('Administrator ID required');
  if (!cutData.shiftStart || !cutData.shiftEnd) throw new Error('Shift times required');
  if (cutData.actualCash < 0) throw new Error('Actual cash cannot be negative');
  if (new Date(cutData.shiftEnd) <= new Date(cutData.shiftStart)) {
    throw new Error('End time must be after start time');
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