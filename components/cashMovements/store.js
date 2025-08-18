const Model = require('./model');

async function createMovement(movementData) {
  try {

    const movementNumber = await Model.generateMovementNumber();
    
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
      receiptNumber: movementData.receiptNumber,
      authorized: movementData.authorized !== undefined ? movementData.authorized : true,
      authorizedBy: movementData.authorizedBy,
      notes: movementData.notes
    });

    const savedMovement = await movement.save();
    return await Model.findById(savedMovement.id)
      .populate('user', 'name lastNames userName')
      .populate('company', 'name')
      .populate('saleReference');
  } catch (error) {
    throw new Error(`Error creating movement: ${error.message}`);
  }
}

async function getMovements(filters = {}) {
  try {
    const query = { disable: false };
    
    
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
    const allowedUpdates = ['concept', 'description', 'notes', 'authorized', 'authorizedBy'];
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
    const movement = await Model.findByIdAndUpdate(
      movementId,
      { disable: true, updatedAt: new Date() },
      { new: true }
    );

    if (!movement) {
      throw new Error('Movement not found');
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
      user: userId 
    };

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
      // eslint-disable-next-line object-shorthand
      cashRegister: cashRegister 
    };

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
  getMovements,
  getMovementById,
  updateMovement,
  deleteMovement,
  getDailySummary,
  getUserMovements,
  getCashRegisterMovements,
  getMovementsByDateRange
};