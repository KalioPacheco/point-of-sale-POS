const Model = require('./model');

function scope(companyId, cashRegister) {
  if (!companyId) throw new Error('Company scope is required');
  return { company: companyId, cashRegister };
}

async function openShift(data) {
  const filter = { ...scope(data.companyId, data.cashRegister), status: 'open' };
  const existing = await Model.findOne(filter);
  if (existing) {
    if (String(existing.cashier) !== String(data.cashierId)) {
      throw new Error('This cash register already has a shift opened by another cashier');
    }
    return existing;
  }

  try {
    return await Model.create({
      company: data.companyId,
      cashRegister: data.cashRegister,
      cashier: data.cashierId,
      openingCash: data.openingCash,
      notes: data.notes
    });
  } catch (error) {
    if (error.code === 11000) {
      const concurrentShift = await Model.findOne(filter);
      if (concurrentShift && String(concurrentShift.cashier) === String(data.cashierId)) {
        return concurrentShift;
      }
      throw new Error('This cash register already has an open shift');
    }
    throw error;
  }
}

function getCurrentShift(companyId, cashRegister, cashierId) {
  return Model.findOne({
    ...scope(companyId, cashRegister),
    cashier: cashierId,
    status: 'open'
  })
    .populate('cashier', 'name lastNames userName');
}

async function closeShift(shiftId, companyId, closingCash, notes, actorId, actorRole) {
  const filter = { _id: shiftId, company: companyId, status: 'open' };
  if (actorRole === 'vendedor') filter.cashier = actorId;
  const shift = await Model.findOne(filter);
  if (!shift) throw new Error('Open shift not found');
  shift.status = 'closed';
  shift.closingCash = closingCash;
  shift.closedAt = new Date();
  shift.cutStatus = 'pending';
  shift.closeRequestedBy = actorId;
  shift.closeRequestedAt = new Date();
  if (notes) shift.notes = notes;
  return shift.save();
}

function listPendingCuts(companyId) {
  return Model.find({
    company: companyId,
    status: 'closed',
    cutStatus: 'pending'
  })
    .populate('cashier', 'name lastNames userName')
    .sort({ closedAt: 1 });
}

module.exports = { openShift, getCurrentShift, closeShift, listPendingCuts };
