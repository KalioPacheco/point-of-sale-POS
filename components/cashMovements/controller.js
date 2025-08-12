const store = require('./store');

// Validaciones
const validateMovementData = (movementData) => {
  if (!movementData.type) throw new Error('Movement type required');
  if (!movementData.amount) throw new Error('Amount required');
  if (!movementData.concept) throw new Error('Concept required');
  if (!movementData.userId) throw new Error('User ID required');
  if (movementData.amount <= 0) throw new Error('Amount must be greater than 0');
  
  const validTypes = ['sale', 'expense', 'withdrawal', 'initial_cash', 'change_denomination', 'refund', 'other'];
  if (!validTypes.includes(movementData.type)) {
    throw new Error('Invalid movement type');
  }
};

const validateFilters = (filters) => {
  if (filters.startDate && filters.endDate) {
    if (new Date(filters.endDate) <= new Date(filters.startDate)) {
      throw new Error('End date must be after start date');
    }
  }
};

module.exports = {
  createMovement(movementData) {
    validateMovementData(movementData);
    return store.createMovement(movementData);
  },

  getMovements(filters) {
    if (filters) validateFilters(filters);
    return store.getMovements(filters);
  },

  getMovementById(movementId) {
    if (!movementId) throw new Error('Movement ID required');
    return store.getMovementById(movementId);
  },

  updateMovement(movementId, updateData) {
    if (!movementId) throw new Error('Movement ID required');
    if (!updateData) throw new Error('Update data required');
    return store.updateMovement(movementId, updateData);
  },

  deleteMovement(movementId) {
    if (!movementId) throw new Error('Movement ID required');
    return store.deleteMovement(movementId);
  },

  getDailySummary(date, companyId) {
    if (!date) throw new Error('Date required');
    return store.getDailySummary(date, companyId);
  },

  getUserMovements(userId, filters) {
    if (!userId) throw new Error('User ID required');
    return store.getUserMovements(userId, filters);
  },

  getCashRegisterMovements(cashRegister, filters) {
    if (!cashRegister) throw new Error('Cash register required');
    return store.getCashRegisterMovements(cashRegister, filters);
  },

  getMovementsByDateRange(startDate, endDate, companyId) {
    if (!startDate || !endDate) throw new Error('Start date and end date required');
    if (new Date(endDate) <= new Date(startDate)) {
      throw new Error('End date must be after start date');
    }
    return store.getMovementsByDateRange(startDate, endDate, companyId);
  }
};