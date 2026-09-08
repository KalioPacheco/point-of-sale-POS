const store = require('./store');

module.exports = {
  list: store.list,
  get: store.get,
  add(data, companyId, actorId) {
    if (!companyId || !actorId) throw new Error('Empresa y usuario autenticado son requeridos');
    return store.add(data, companyId, actorId);
  },
  update(cashRegisterId, data, companyId, actorId) {
    if (!cashRegisterId) throw new Error('Caja requerida');
    return store.update(cashRegisterId, data, companyId, actorId);
  },
};
