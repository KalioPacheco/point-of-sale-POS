const store = require('./store');

function addSell(sell) {
  if (!sell) {
    return Promise.reject(`Sell data is empty. User: ${JSON.stringify(sell)}`);
  }

  return store.add(sell);
}

function listSales(sellId, companyId) {
  return store.list(sellId, companyId);
}

function updateSell(sellId, sell) {
  if (!sellId || !sell) {
    return Promise.reject(
      `companyId or company is undefined. userId is: ${sellId}, user is: ${JSON.stringify(
        sell,
      )}`,
    );
  }
  return store.update(sellId, sell);
}

function removeSell(sellId) {
  if (!sellId) {
    return Promise.reject('companyId is undefined');
  }
  return store.remove(sellId);
}

module.exports = {
  addSell,
  listSales,
  updateSell,
  removeSell,
};
