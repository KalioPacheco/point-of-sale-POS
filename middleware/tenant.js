const mongoose = require('mongoose');
const Helper = require('../helpers');
const response = require('../network');

function requireCompanyScope(req, res, next) {
  const companyId = Helper.getCompanyId(req);
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    return response.error(req, res, 'Company scope is required', 403);
  }
  req.companyId = companyId;
  return next();
}

const scopeResource = (Model, paramName, companyField = 'company') => async (req, res, next) => {
  try {
    const id = req.params[paramName] || req.body[paramName];
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.error(req, res, 'Invalid resource ID', 400);
    }
    const resource = await Model.findOne({ _id: id, [companyField]: req.companyId });
    if (!resource) return response.error(req, res, 'Resource not found', 404);
    req.scopedResource = resource;
    return next();
  } catch (error) {
    return next(error);
  }
};

const requireTenantParam = paramName => (req, res, next) => {
  if (String(req.params[paramName]) !== String(req.companyId)) {
    return response.error(req, res, 'Resource not found', 404);
  }
  return next();
};

module.exports = { requireCompanyScope, scopeResource, requireTenantParam };
