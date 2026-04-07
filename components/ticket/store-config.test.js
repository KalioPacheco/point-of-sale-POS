const test = require('node:test');
const assert = require('node:assert/strict');

const ticketStore = require('./store');

const {
  updateStoreInfo,
  getStoreInfo,
  __storeConfigUtils,
} = ticketStore;

const buildCompanyDoc = (overrides = {}) => ({
  _id: 'company-1',
  name: 'Empresa Demo QA',
  rfc: 'DEM010101AAA',
  address: {
    street: 'Demo 123',
    number: { ext: '10', int: '2' },
    city: 'CDMX',
    state: 'CDMX',
    country: 'MX',
  },
  ticketStoreConfig: {
    name: '',
    address: '',
    phone: '',
    taxId: '',
    email: '',
  },
  async save() {
    return this;
  },
  ...overrides,
});

test('store-config persiste y se lee con contrato consistente', async () => {
  const companyDoc = buildCompanyDoc();

  const fakeCompaniesModel = {
    async findById(id) {
      return id === 'company-1' ? companyDoc : null;
    },
  };

  const payload = {
    name: 'Tienda QA AUD-07',
    address: 'Calle Falsa 123, Centro, CDMX, MX',
    phone: '+52 55 1234 5678',
    taxId: 'XAXX010101000',
    email: 'tienda.qa@example.com',
  };

  const updateResult = await updateStoreInfo(payload, 'company-1', {
    companiesModel: fakeCompaniesModel,
  });

  assert.equal(updateResult.success, true);
  assert.equal(updateResult.storeInfo.address, payload.address);
  assert.equal(companyDoc.ticketStoreConfig.address, payload.address);
  assert.equal(companyDoc.ticketStoreConfig.phone, payload.phone);
  assert.equal(companyDoc.ticketStoreConfig.taxId, payload.taxId);
  assert.equal(companyDoc.ticketStoreConfig.email, payload.email);

  const readResult = await getStoreInfo('company-1', {
    companiesModel: fakeCompaniesModel,
  });

  assert.deepEqual(readResult, payload);
});

test('normaliza address legacy de company a string cuando no hay ticketStoreConfig', async () => {
  const legacyCompany = buildCompanyDoc({
    ticketStoreConfig: undefined,
    address: {
      street: 'Av Reforma',
      number: { ext: '100', int: '2' },
      city: 'CDMX',
      state: 'CDMX',
      country: 'MX',
    },
  });

  const fakeCompaniesModel = {
    async findById() {
      return legacyCompany;
    },
  };

  const storeInfo = await getStoreInfo('company-1', {
    companiesModel: fakeCompaniesModel,
  });

  assert.equal(typeof storeInfo.address, 'string');
  assert.match(storeInfo.address, /Av Reforma/);
  assert.match(storeInfo.address, /CDMX/);
});

test('falla updateStoreInfo si no existe company para persistir', async () => {
  const fakeCompaniesModel = {
    async findById() {
      return null;
    },
  };

  await assert.rejects(
    () => updateStoreInfo({ name: 'Sin Empresa' }, 'missing-company', { companiesModel: fakeCompaniesModel }),
    /No se encontró empresa para persistir store-config/
  );
});

test('utilidad de contrato mantiene defaults seguros', () => {
  const normalized = __storeConfigUtils.normalizeStoreConfigInput(
    { name: '  Mi Tienda  ', address: '  Av Siempre Viva  ' },
    __storeConfigUtils.DEFAULT_STORE_CONFIG
  );

  assert.deepEqual(normalized, {
    name: 'Mi Tienda',
    address: 'Av Siempre Viva',
    phone: '',
    taxId: '',
    email: '',
  });
});
