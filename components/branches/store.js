const Branch = require('./model');
const CashRegisterShift = require('../cashRegisterShifts/model');
const { StockTransfer } = require('../inventory/model');

const isAdmin = user => user?.role === 'admin';

const assignmentBranchIds = (user) => (user?.branchAssignments || [])
  .filter(assignment => assignment?.active !== false && assignment?.branch)
  .map(assignment => String(assignment.branch._id || assignment.branch));

function notFound(message = 'Sucursal no encontrada') {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function validateInput(data, partial = false) {
  const code = typeof data?.code === 'string' ? data.code.trim().toUpperCase() : '';
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  if (!partial && (!code || !name)) throw new Error('Código y nombre de sucursal son requeridos');
  if (data?.code !== undefined && !code) throw new Error('Código de sucursal inválido');
  if (data?.name !== undefined && !name) throw new Error('Nombre de sucursal inválido');
  return { code, name };
}

async function list(companyId, user) {
  const query = { company: companyId };
  if (!isAdmin(user)) {
    query.active = true;
    const assigned = assignmentBranchIds(user);
    if (assigned.length === 0) return [];
    query._id = { $in: assigned };
  }
  return Branch.find(query).sort({ name: 1, _id: 1 }).lean();
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

/**
 * A deactivated branch must not orphan an active cash operation or stock that
 * has physically left its origin but has not reached its destination yet.
 */
async function assertCanDeactivate(branchId, companyId) {
  const [openShift, transfer] = await Promise.all([
    CashRegisterShift.exists({ company: companyId, branch: branchId, status: 'open' }),
    StockTransfer.exists({
      company: companyId,
      status: 'in_transit',
      $or: [{ originBranch: branchId }, { destinationBranch: branchId }],
    }),
  ]);
  if (openShift) throw conflict('No se puede desactivar la sucursal mientras tenga un turno abierto');
  if (transfer) throw conflict('No se puede desactivar la sucursal mientras tenga transferencias en tránsito');
}

async function get(branchId, companyId, user) {
  const rows = await list(companyId, user);
  const branch = rows.find(item => String(item._id) === String(branchId));
  if (!branch) throw notFound();
  return branch;
}

async function add(data, companyId, actorId) {
  const normalized = validateInput(data);
  return Branch.create({
    company: companyId,
    code: normalized.code,
    name: normalized.name,
    address: data.address || {},
    active: data.active !== false,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

async function update(branchId, data, companyId, actorId) {
  const branch = await Branch.findOne({ _id: branchId, company: companyId });
  if (!branch) throw notFound();
  const normalized = validateInput(data, true);
  if (data.code !== undefined) branch.code = normalized.code;
  if (data.name !== undefined) branch.name = normalized.name;
  if (data.address !== undefined) branch.address = { ...branch.address?.toObject?.(), ...data.address };
  if (data.active === false && branch.active !== false) {
    await assertCanDeactivate(branch._id, companyId);
    branch.active = false;
  }
  if (data.active === true) branch.active = true;
  branch.updatedBy = actorId;
  return branch.save();
}

module.exports = { list, get, add, update, assignmentBranchIds, assertCanDeactivate };
