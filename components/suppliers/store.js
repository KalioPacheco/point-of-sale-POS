const mongoose = require('mongoose');
const Supplier = require('./model');

function tenantFilter(companyId, extra = {}) {
  if (!mongoose.Types.ObjectId.isValid(companyId)) throw new Error('Company scope is required');
  return { company: companyId, ...extra };
}

function cleanPayload(input = {}) {
  const fields = ['name', 'taxId', 'contactName', 'email', 'phone', 'address', 'notes'];
  return fields.reduce((payload, field) => {
    if (typeof input[field] === 'string') payload[field] = input[field].trim();
    return payload;
  }, {});
}

async function create(input, companyId, userId) {
  return Supplier.create({ ...cleanPayload(input), company: companyId, createdBy: userId });
}

async function list(companyId, { includeDisabled = false, q } = {}) {
  const filter = tenantFilter(companyId, includeDisabled ? {} : { disable: false });
  if (q?.trim()) filter.name = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return Supplier.find(filter).sort({ name: 1, _id: 1 }).lean();
}

async function get(supplierId, companyId, { includeDisabled = false } = {}) {
  const filter = tenantFilter(companyId, { _id: supplierId });
  if (!includeDisabled) filter.disable = false;
  return Supplier.findOne(filter);
}

async function update(supplierId, input, companyId) {
  const supplier = await get(supplierId, companyId, { includeDisabled: true });
  if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });
  Object.assign(supplier, cleanPayload(input));
  if (typeof input.disable === 'boolean') supplier.disable = input.disable;
  return supplier.save();
}

module.exports = { create, list, get, update };
