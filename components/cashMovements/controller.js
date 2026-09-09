const store = require('./store');
const {
  CASH_MOVEMENT_TYPES,
  normalizeCashMovementType,
} = require('./types');

const validateMovementData = (movementData) => {
  if (!movementData.type) throw new Error('Movement type required');
  if (!movementData.amount) throw new Error('Amount required');
  if (!movementData.concept) throw new Error('Concept required');
  if (!movementData.userId) throw new Error('User ID required');
  if (movementData.amount <= 0) throw new Error('Amount must be greater than 0');
  
  const validTypes = CASH_MOVEMENT_TYPES;
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
    movementData.type = normalizeCashMovementType(movementData.type);

    validateMovementData(movementData);
    return store.createMovement(movementData);
  },

  requestMovement(movementData) {
    movementData.type = normalizeCashMovementType(movementData.type);
    validateMovementData(movementData);
    if (!['income', 'withdrawal'].includes(movementData.type)) {
      throw new Error('Only cash income and withdrawal requests are allowed');
    }
    if (!movementData.shiftId || !movementData.cashRegister) {
      throw new Error('An open shift is required for a cash movement request');
    }
    return store.requestMovement(movementData);
  },

  approveRequestedMovement(movementId, companyId, approverId, note) {
    if (!movementId || !companyId || !approverId) {
      throw new Error('Movement and approver are required');
    }
    return store.decideRequestedMovement(movementId, {
      companyId, approverId, note, approved: true
    });
  },

  rejectRequestedMovement(movementId, companyId, approverId, note) {
    if (!movementId || !companyId || !approverId) {
      throw new Error('Movement and approver are required');
    }
    if (!note?.trim()) throw new Error('A reason is required to reject a cash movement request');
    return store.decideRequestedMovement(movementId, {
      companyId, approverId, note: note.trim(), approved: false
    });
  },

  getPendingMovements(filters) {
    return store.getPendingMovements(filters);
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

  getDailySummary(date, companyId, branchIds) {
    if (!date) throw new Error('Date required');
    return store.getDailySummary(date, companyId, branchIds);
  },

  getUserMovements(userId, filters) {
    if (!userId) throw new Error('User ID required');
    return store.getUserMovements(userId, filters);
  },

  getCashRegisterMovements(cashRegister, filters) {
    if (!cashRegister) throw new Error('Cash register required');
    return store.getCashRegisterMovements(cashRegister, filters);
  },

  getMovementsByDateRange(startDate, endDate, companyId, branchIds) {
    if (!startDate || !endDate) throw new Error('Start date and end date required');
    if (new Date(endDate) <= new Date(startDate)) {
      throw new Error('End date must be after start date');
    }
    return store.getMovementsByDateRange(startDate, endDate, companyId, branchIds);
  }
};
