const store = require('./store');

module.exports = {
  list: store.list,
  get: store.get,
  add(data, companyId, actorId) {
    if (!companyId || !actorId) throw new Error('Empresa y usuario autenticado son requeridos');
    return store.add(data, companyId, actorId);
  },
  update(branchId, data, companyId, actorId) {
    if (!branchId) throw new Error('Sucursal requerida');
    return store.update(branchId, data, companyId, actorId);
  },
};
