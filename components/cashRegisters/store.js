const CashRegister = require('./model');
const Branch = require('../branches/model');
const CashRegisterShift = require('../cashRegisterShifts/model');
const { assignmentBranchIds } = require('../branches/store');

const isAdmin = user => user?.role === 'admin';

function notFound(message = 'Caja no encontrada') {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function normalize(data, partial = false) {
  const code = typeof data?.code === 'string' ? data.code.trim().toUpperCase() : '';
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  if (!partial && (!data?.branchId || !code || !name)) throw new Error('Sucursal, código y nombre de caja son requeridos');
  if (data?.code !== undefined && !code) throw new Error('Código de caja inválido');
  if (data?.name !== undefined && !name) throw new Error('Nombre de caja inválido');
  return { code, name };
}

async function assertCompanyBranch(branchId, companyId) {
  const branch = await Branch.findOne({ _id: branchId, company: companyId, active: true }).lean();
  if (!branch) throw notFound('Sucursal no encontrada');
  return branch;
}

async function list(companyId, user, branchId = null) {
  const query = { company: companyId };
  if (!isAdmin(user)) query.active = true;
  if (branchId) query.branch = branchId;
  if (!isAdmin(user)) {
    const branchIds = assignmentBranchIds(user);
    if (branchIds.length === 0) return [];
    if (branchId && !branchIds.includes(String(branchId))) return [];
    query.branch = branchId || { $in: branchIds };
  }
  return CashRegister.find(query).populate('branch', 'code name').sort({ name: 1, _id: 1 }).lean();
}

async function assertCanDeactivate(register, companyId) {
  const openShift = await CashRegisterShift.exists({
    company: companyId,
    status: 'open',
    $or: [
      { cashRegisterId: register._id },
      // Older migrated records can still have only the textual identifier.
      { cashRegister: register.code, branch: register.branch },
    ],
  });
  if (openShift) {
    const error = new Error('No se puede desactivar la caja mientras tenga un turno abierto');
    error.status = 409;
    throw error;
  }
}

async function get(cashRegisterId, companyId, user) {
  const rows = await list(companyId, user);
  const register = rows.find(item => String(item._id) === String(cashRegisterId));
  if (!register) throw notFound();
  return register;
}

async function add(data, companyId, actorId) {
  const normalized = normalize(data);
  await assertCompanyBranch(data.branchId, companyId);
  return CashRegister.create({
    company: companyId,
    branch: data.branchId,
    code: normalized.code,
    name: normalized.name,
    active: data.active !== false,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

async function update(cashRegisterId, data, companyId, actorId) {
  const register = await CashRegister.findOne({ _id: cashRegisterId, company: companyId });
  if (!register) throw notFound();
  const normalized = normalize(data, true);
  if (data.branchId !== undefined) {
    if (String(data.branchId) !== String(register.branch)) await assertCanDeactivate(register, companyId);
    await assertCompanyBranch(data.branchId, companyId);
    register.branch = data.branchId;
  }
  if (data.code !== undefined) register.code = normalized.code;
  if (data.name !== undefined) register.name = normalized.name;
  if (data.active === false && register.active !== false) {
    await assertCanDeactivate(register, companyId);
    register.active = false;
  }
  if (data.active === true) register.active = true;
  register.updatedBy = actorId;
  return register.save();
}

module.exports = { list, get, add, update, assertCompanyBranch, assertCanDeactivate };
