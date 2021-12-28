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

function updateType(typeId, type) {
  if (!typeId || !type) {
    return Promise.reject(
      `typeId or data is undefined. userId is: ${typeId}, user is: ${JSON.stringify(
        type,
      )}`,
    );
  }
  return store.update(typeId, type);
}

function removeType(typeId) {
  if (!typeId) {
    return Promise.reject('typeId is undefined');
  }
  return store.remove(typeId);
}

module.exports = {
  addType,
  listTypes,
  updateType,
  removeType,
};
