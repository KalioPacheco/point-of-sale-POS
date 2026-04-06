const store = require('./store');

function addType(type) {
  if (!type) {
    return Promise.reject(`Type data is empty. User: ${JSON.stringify(type)}`);
  }

  return store.add(type);
}

function listTypes(typeId, companyId) {
  return store.list(typeId, companyId);
}

function updateType(typeId, type, companyId) {
  if (!typeId || !type) {
    return Promise.reject(
      `typeId or data is undefined. userId is: ${typeId}, user is: ${JSON.stringify(
        type,
      )}`,
    );
  }
  return store.update(typeId, type, companyId);
}

function removeType(typeId, companyId) {
  if (!typeId) {
    return Promise.reject('typeId is undefined');
  }
  return store.remove(typeId, companyId);
}

module.exports = {
  addType,
  listTypes,
  updateType,
  removeType,
};
