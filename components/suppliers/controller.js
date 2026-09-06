const store = require('./store');

module.exports = {
  create: (input, companyId, userId) => store.create(input, companyId, userId),
  list: (companyId, filters) => store.list(companyId, filters),
  update: (supplierId, input, companyId) => store.update(supplierId, input, companyId),
};
