const Model = require('./model');
const { applyBranchScope } = require('../../helpers/branchScope');

function scope(companyId, cashRegister, context = null) {
  if (!companyId) throw new Error('Company scope is required');
  const query = { company: companyId, cashRegister };
  if (context?.branch) query.branch = context.branch;
  if (context?._id) query.cashRegisterId = context._id;
  return query;
}

async function openShift(data) {
  const context = data.cashRegisterId ? { _id: data.cashRegisterId, branch: data.branchId } : null;
  const filter = { ...scope(data.companyId, data.cashRegister, context), status: 'open' };
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
      branch: data.branchId,
      cashRegisterId: data.cashRegisterId,
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

function getCurrentShift(companyId, cashRegister, cashierId, cashRegisterContext = null) {
  return Model.findOne({
    ...scope(companyId, cashRegister, cashRegisterContext),
    cashier: cashierId,
    status: 'open'
  })
    .populate('cashier', 'name lastNames userName');
}

async function closeShift(shiftId, companyId, closingCash, notes, actorId, actorRole) {
  const filter = { _id: shiftId, company: companyId, status: 'open' };
  if (actorRole === 'vendedor') filter.cashier = actorId;
  const now = new Date();
  const shift = await Model.findOneAndUpdate(filter, { $set: {
    status: 'closed', closingCash, closedAt: now, cutStatus: 'pending',
    closeRequestedBy: actorId, closeRequestedAt: now, ...(notes ? { notes } : {})
  }, $inc: { operationRevision: 1 } }, { new: true, runValidators: true });
  if (!shift) throw new Error('Open shift not found');
  return shift;
}

function listPendingCuts(companyId, branchIds = null) {
  const query = {
    company: companyId,
    status: 'closed',
    cutStatus: 'pending'
  };
  if (Array.isArray(branchIds)) {
    applyBranchScope(query, 'branch', branchIds);
  }
  return Model.find(query)
    .populate('cashier', 'name lastNames userName')
    .sort({ closedAt: 1 });
}

module.exports = { openShift, getCurrentShift, closeShift, listPendingCuts };
