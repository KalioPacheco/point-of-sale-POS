const Model = require('./model');
const Shift = require('../cashRegisterShifts/model');

const settledApproval = { $nin: ['pending', 'rejected'] };

const populateMovement = movement => Model.findById(movement.id || movement._id)
  .populate('user', 'name lastNames userName')
  .populate('company', 'name')
  .populate('saleReference')
  .populate('authorizedBy', 'name lastNames userName');

async function createMovement(movementData) {
  if (Boolean(movementData.cashRegister) !== Boolean(movementData.shiftId)) {
    throw new Error('Cash register and shift are required together');
  }
  const session = await Model.db.startSession();
  let savedMovement;
  try {
    await session.withTransaction(async () => {
      if (movementData.shiftId) {
        const shift = await Shift.findOneAndUpdate({
          _id: movementData.shiftId, company: movementData.companyId,
          cashRegister: movementData.cashRegister, cashier: movementData.userId, status: 'open'
        }, { $inc: { operationRevision: 1 } }, { new: true, session });
        if (!shift) throw new Error('Open shift not found for cash movement');
      }
      const movementNumber = await Model.generateMovementNumber(
        movementData.companyId,
        movementData.cashRegister || 'GLOBAL',
        session
      );
    
      const approvalStatus = movementData.approvalStatus || 'approved';
      const movement = new Model({
        movementNumber,
        type: movementData.type,
        amount: movementData.amount,
        concept: movementData.concept,
        description: movementData.description,
        paymentMethod: movementData.paymentMethod || 'cash',
        user: movementData.userId,
        company: movementData.companyId,
        cashRegister: movementData.cashRegister,
        saleReference: movementData.saleReference,
        shift: movementData.shiftId,
        receiptNumber: movementData.receiptNumber,
        authorized: approvalStatus === 'approved',
        authorizedBy: approvalStatus === 'approved'
          ? movementData.authorizedBy || movementData.userId
          : undefined,
        approvalStatus,
        approvalRequestedAt: movementData.approvalRequestedAt || new Date(),
        notes: movementData.notes
      });

      savedMovement = await movement.save({ session });
    });
    return await populateMovement(savedMovement);
  } catch (error) {
    throw new Error(`Error creating movement: ${error.message}`);
  } finally {
    await session.endSession();
  }
}

function forbidden(message) {
  const error = new Error(`Forbidden: ${message}`);
  error.code = 'FORBIDDEN';
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.code = 'CONFLICT';
  return error;
}

async function requestMovement(movementData) {
  return createMovement({ ...movementData, approvalStatus: 'pending' });
}

async function decideRequestedMovement(movementId, decision) {
  const session = await Model.db.startSession();
  let movement;
  try {
    await session.withTransaction(async () => {
      movement = await Model.findOne({
        _id: movementId,
        company: decision.companyId,
        disable: false,
        approvalStatus: 'pending'
      }).session(session);
      if (!movement) throw conflict('Pending cash movement not found');
      if (String(movement.user) === String(decision.approverId)) {
        throw forbidden('A requester cannot approve or reject their own cash movement');
      }

      if (decision.approved) {
        const shift = await Shift.findOneAndUpdate({
          _id: movement.shift,
          company: decision.companyId,
          cashRegister: movement.cashRegister,
          status: 'open'
        }, { $inc: { operationRevision: 1 } }, { new: true, session });
        if (!shift) throw conflict('The shift is closed; the cash movement cannot be approved');
      }

      movement.approvalStatus = decision.approved ? 'approved' : 'rejected';
      movement.authorized = Boolean(decision.approved);
      movement.authorizedBy = decision.approverId;
      movement.approvalDecidedAt = new Date();
      movement.approvalNote = decision.note;
      await movement.save({ session });
    });
    return await populateMovement(movement);
  } finally {
    await session.endSession();
  }
}

async function getPendingMovements({ companyId, userId, role }) {
  const query = { company: companyId, disable: false, approvalStatus: 'pending' };
  if (role === 'vendedor') query.user = userId;
  return Model.find(query)
    .populate('user', 'name lastNames userName')
    .populate('authorizedBy', 'name lastNames userName')
    .sort({ approvalRequestedAt: 1, _id: 1 })
    .limit(100);
}

async function getMovements(filters = {}) {
  try {
    const query = { disable: false, approvalStatus: settledApproval };
    
    
    if (filters.companyId && filters.companyId !== 'default-company-id') {
      query.company = filters.companyId;
    }
    if (filters.userId) query.user = filters.userId;
    if (filters.type) query.type = filters.type;
    if (filters.cashRegister) query.cashRegister = filters.cashRegister;
    if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
    
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }
    
    if (filters.date) {
      const startOfDay = new Date(filters.date);
      const endOfDay = new Date(filters.date);
      endOfDay.setHours(23, 59, 59, 999);
      
      query.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    }

    const movements = await Model.find(query)
      .populate('user', 'name lastNames userName')
      .populate('company', 'name')
      .populate('saleReference')
      .sort({ createdAt: -1 })
      .limit(filters.limit ? parseInt(filters.limit, 10) : 100);

    return movements;
  } catch (error) {
    throw new Error(`Error getting movements: ${error.message}`);
  }
}

async function getMovementById(movementId) {
  try {
    const movement = await Model.findById(movementId)
      .populate('user', 'name lastNames userName')
      .populate('company', 'name')
      .populate('saleReference')
      .populate('authorizedBy', 'name lastNames userName');

    if (!movement) {
      throw new Error('Movement not found');
    }

    return movement;
  } catch (error) {
    throw new Error(`Error getting movement: ${error.message}`);
  }
}

async function updateMovement(movementId, updateData) {
  try {
    const allowedUpdates = ['notes'];
    const filteredData = {};
    
    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });

    const movement = await Model.findByIdAndUpdate(
      movementId,
      { ...filteredData, updatedAt: new Date() },
      { new: true, runValidators: true }
    )
      .populate('user', 'name lastNames userName')
      .populate('company', 'name')
      .populate('saleReference');

    if (!movement) {
      throw new Error('Movement not found');
    }

    return movement;
  } catch (error) {
    throw new Error(`Error updating movement: ${error.message}`);
  }
}

async function deleteMovement(movementId) {
  try {
    const movement = await Model.findOneAndUpdate(
      { _id: movementId, approvalStatus: 'pending' },
      { disable: true, updatedAt: new Date() },
      { new: true }
    );

    if (!movement) {
      throw new Error('Only pending cash movement requests can be cancelled');
    }

    return movement;
  } catch (error) {
    throw new Error(`Error deleting movement: ${error.message}`);
  }
}

async function getDailySummary(date, companyId) {
  try {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const query = {
      disable: false,
      approvalStatus: settledApproval,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    };

    if (companyId && companyId !== 'default-company-id') {
      query.company = companyId;
    }

    const movements = await Model.find(query);

    const summary = {
      date,
      totalMovements: movements.length,
      income: 0,
      expenses: 0,
      net: 0,
      byType: {},
      byCashRegister: {},
      byPaymentMethod: {}
    };

    movements.forEach(movement => {
      const sign = movement.getMovementSign();
      const { amount } = movement;
     
      if (sign > 0) {
        summary.income += amount;
      } else if (sign < 0) {
        summary.expenses += amount;
      }

      if (!summary.byType[movement.type]) {
        summary.byType[movement.type] = { count: 0, amount: 0 };
      }
      summary.byType[movement.type].count += 1;
      summary.byType[movement.type].amount += amount;

      const cashRegister = movement.cashRegister || 'N/A';
      if (!summary.byCashRegister[cashRegister]) {
        summary.byCashRegister[cashRegister] = { count: 0, amount: 0 };
      }
      summary.byCashRegister[cashRegister].count += 1;
      summary.byCashRegister[cashRegister].amount += amount;

      if (!summary.byPaymentMethod[movement.paymentMethod]) {
        summary.byPaymentMethod[movement.paymentMethod] = { count: 0, amount: 0 };
      }
      summary.byPaymentMethod[movement.paymentMethod].count += 1;
      summary.byPaymentMethod[movement.paymentMethod].amount += amount;
    });

    summary.net = summary.income - summary.expenses;

    return summary;
  } catch (error) {
    throw new Error(`Error getting daily summary: ${error.message}`);
  }
}

async function getUserMovements(userId, filters = {}) {
  try {
    const query = { 
      disable: false, 
      approvalStatus: settledApproval,
      user: userId 
    };
    if (filters.companyId) query.company = filters.companyId;

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const movements = await Model.find(query)
      .populate('company', 'name')
      .populate('saleReference')
      .sort({ createdAt: -1 });

    return movements;
  } catch (error) {
    throw new Error(`Error getting user movements: ${error.message}`);
  }
}

async function getCashRegisterMovements(cashRegister, filters = {}) {
  try {
    const query = { 
      disable: false, 
      approvalStatus: settledApproval,
      // eslint-disable-next-line object-shorthand
      cashRegister: cashRegister 
    };
    if (filters.companyId) query.company = filters.companyId;

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const movements = await Model.find(query)
      .populate('user', 'name lastNames userName')
      .populate('company', 'name')
      .populate('saleReference')
      .sort({ createdAt: -1 });

    return movements;
  } catch (error) {
    throw new Error(`Error getting cash register movements: ${error.message}`);
  }
}

async function getMovementsByDateRange(startDate, endDate, companyId) {
  try {
    const query = {
      disable: false,
      approvalStatus: settledApproval,
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (companyId && companyId !== 'default-company-id') {
      query.company = companyId;
    }

    const movements = await Model.find(query)
      .populate('user', 'name lastNames userName')
      .populate('company', 'name')
      .populate('saleReference')
      .sort({ createdAt: -1 });

    return movements;
  } catch (error) {
    throw new Error(`Error getting movements by date range: ${error.message}`);
  }
}

module.exports = {
  createMovement,
  requestMovement,
  decideRequestedMovement,
  getPendingMovements,
  getMovements,
  getMovementById,
  updateMovement,
  deleteMovement,
  getDailySummary,
  getUserMovements,
  getCashRegisterMovements,
  getMovementsByDateRange
};
