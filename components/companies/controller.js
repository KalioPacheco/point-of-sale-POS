const store = require('./store');

function addCompany(company) {
  if (!company) {
    return Promise.reject(
      `Company data is empty. User: ${JSON.stringify(company)}`,
    );
  }

  return store.add(company);
}

function listCompanies(companyId) {
  return store.list(companyId);
}

function updateCompany(companyId, company) {
  if (!companyId || !company) {
    return Promise.reject(
      `companyId or company is undefined. userId is: ${companyId}, user is: ${JSON.stringify(
        company,
      )}`,
    );
  }
  return store.update(companyId, company);
}

function removeCompany(companyId) {
  if (!companyId) {
    return Promise.reject('companyId is undefined');
  }
  return store.remove(companyId);
}

module.exports = {
  addCompany,
  listCompanies,
  updateCompany,
  removeCompany,
};
