const store = require('./store');

function addCompany(company) {
  if (!company) {
    return Promise.reject(
      `Company data is empty. User: ${JSON.stringify(company)}`,
    );
  }

  return store.add(company);
}

function listCompanies(companyId, scopeCompanyId) {
  if (companyId && scopeCompanyId && companyId !== scopeCompanyId) {
    return Promise.reject('No autorizado para consultar otra empresa');
  }

  return store.list(scopeCompanyId || companyId);
}

function updateCompany(companyId, company, scopeCompanyId) {
  if (!companyId || !company) {
    return Promise.reject(
      `companyId or company is undefined. userId is: ${companyId}, user is: ${JSON.stringify(
        company,
      )}`,
    );
  }
  if (scopeCompanyId && companyId !== scopeCompanyId) {
    return Promise.reject('No autorizado para modificar otra empresa');
  }
  return store.update(companyId, company);
}

function removeCompany(companyId, scopeCompanyId) {
  if (!companyId) {
    return Promise.reject('companyId is undefined');
  }
  if (scopeCompanyId && companyId !== scopeCompanyId) {
    return Promise.reject('No autorizado para eliminar otra empresa');
  }
  return store.remove(companyId);
}

module.exports = {
  addCompany,
  listCompanies,
  updateCompany,
  removeCompany,
};
