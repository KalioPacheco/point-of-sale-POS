const mongoose = require('mongoose');
const response = require('../network');
const Helper = require('../helpers');
const Branch = require('../components/branches/model');
const CashRegister = require('../components/cashRegisters/model');

const isAdmin = user => user?.role === 'admin';

const assignedBranchIds = (user) => (user?.branchAssignments || [])
  .filter(assignment => assignment?.active !== false && assignment?.branch)
  .map(assignment => String(assignment.branch._id || assignment.branch));

const canAccessBranch = (user, branchId) => isAdmin(user)
  || assignedBranchIds(user).includes(String(branchId));

function companyId(req) {
  return req.companyId || Helper.getCompanyId(req);
}

function readField(req, field) {
  return req.params?.[field] || req.body?.[field] || req.query?.[field];
}

function branchError(req, res, status, message) {
  return response.error(req, res, message, status);
}

function requireBranchAccess(field = 'branchId', { optional = false } = {}) {
  return async (req, res, next) => {
    try {
      const branchId = readField(req, field);
      if (!branchId) {
        if (optional) return next();
        return branchError(req, res, 400, 'Sucursal requerida');
      }
      if (!mongoose.Types.ObjectId.isValid(branchId)) return branchError(req, res, 400, 'ID de sucursal inválido');
      const branch = await Branch.findOne({ _id: branchId, company: companyId(req), active: true }).lean();
      if (!branch || !canAccessBranch(req.user, branch._id)) return branchError(req, res, 404, 'Sucursal no encontrada');
      req.branch = branch;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function resolveCashRegisterContext({ required = false } = {}) {
  return async (req, res, next) => {
    try {
      const cashRegisterId = readField(req, 'cashRegisterId');
      const cashRegisterCode = readField(req, 'cashRegister');
      if (!cashRegisterId && !cashRegisterCode) {
        if (required) return branchError(req, res, 400, 'Caja requerida');
        return next();
      }

      const query = { company: companyId(req), active: true };
      if (cashRegisterId) {
        if (!mongoose.Types.ObjectId.isValid(cashRegisterId)) return branchError(req, res, 400, 'ID de caja inválido');
        query._id = cashRegisterId;
      } else {
        query.code = String(cashRegisterCode).trim().toUpperCase();
      }
      const cashRegister = await CashRegister.findOne(query).lean();
      // Legacy clients keep working before 002 is applied. Once a mapped cash
      // register exists, its branch authorization is mandatory.
      if (!cashRegister) {
        if (cashRegisterId || required) return branchError(req, res, 404, 'Caja no encontrada');
        return next();
      }
      if (!canAccessBranch(req.user, cashRegister.branch)) return branchError(req, res, 404, 'Caja no encontrada');
      req.cashRegisterContext = cashRegister;
      req.branch = await Branch.findOne({ _id: cashRegister.branch, company: companyId(req), active: true }).lean();
      if (!req.branch) return branchError(req, res, 404, 'Sucursal no encontrada');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireScopedBranchAccess(resourceField = 'scopedResource', branchField = 'branch') {
  return (req, res, next) => {
    const resource = req[resourceField];
    const branchId = branchField.split('.').reduce((value, key) => value?.[key], resource);
    // Documents created before migration 002 are intentionally readable through
    // existing tenant rules until they receive MATRIZ attribution.
    if (!branchId || canAccessBranch(req.user, branchId)) return next();
    return branchError(req, res, 404, 'Recurso no encontrado');
  };
}

module.exports = {
  isAdmin,
  assignedBranchIds,
  canAccessBranch,
  requireBranchAccess,
  resolveCashRegisterContext,
  requireScopedBranchAccess,
};
