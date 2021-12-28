const store = require('./store');

function addCustomer(customer) {
  if (!customer) {
    return Promise.reject(
      `Customer data is empty. User: ${JSON.stringify(customer)}`,
    );
  }

  return store.add(customer);
}

function listCustomer(customerId, companyId) {
  return store.list(customerId, companyId);
}

function updateCustomer(customerId, customer) {
  if (!customerId || !customer) {
    return Promise.reject(
      `customerId or customer is undefined. customerId is: ${customerId}, customer is: ${JSON.stringify(
        customer,
      )}`,
    );
  }
  return store.update(customerId, customer);
}

function removeCustomer(customerId) {
  if (!customerId) {
    return Promise.reject('customerId is undefined');
  }
  return store.remove(customerId);
}

module.exports = {
  addCustomer,
  listCustomer,
  updateCustomer,
  removeCustomer,
};
