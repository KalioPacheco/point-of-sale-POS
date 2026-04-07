const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('./store');
const Model = require('./model');
const UsersModel = require('../users/model');

test('updateCompany sincroniza ticketStoreConfig con name/rfc/address', async (t) => {
  const originalFindOne = Model.findOne;

  const companyDoc = {
    _id: 'company-1',
    name: 'Empresa Vieja',
    rfc: 'OLD010101AAA',
    address: {
      street: 'Calle Uno',
      city: 'CDMX',
    },
    ticketStoreConfig: {
      name: 'Custom Name',
      address: 'Direccion vieja',
      phone: '5551234567',
      taxId: 'OLD010101AAA',
      email: 'ventas@demo.local',
    },
    disable: false,
    async save() {
      return this;
    },
  };

  Model.findOne = async () => companyDoc;
  t.after(() => {
    Model.findOne = originalFindOne;
  });

  const result = await store.update('company-1', {
    name: 'Empresa Nueva QA',
    rfc: 'new010101bbb',
    address: {
      street: 'Av Reforma',
      number: {
        ext: '100',
        int: '2',
      },
      city: 'CDMX',
      state: 'CDMX',
      country: 'MX',
    },
    disable: false,
  });

  assert.equal(result.name, 'Empresa Nueva QA');
  assert.equal(result.rfc, 'NEW010101BBB');
  assert.equal(result.ticketStoreConfig.name, 'Empresa Nueva QA');
  assert.equal(result.ticketStoreConfig.taxId, 'NEW010101BBB');
  assert.match(result.ticketStoreConfig.address, /Av Reforma/);
  assert.match(result.ticketStoreConfig.address, /CDMX/);
  assert.equal(result.ticketStoreConfig.phone, '5551234567');
  assert.equal(result.ticketStoreConfig.email, 'ventas@demo.local');
});

test('updateCompany mantiene ticketStoreConfig si no cambian datos comerciales', async (t) => {
  const originalFindOne = Model.findOne;
  const originalCountDocuments = UsersModel.countDocuments;

  const companyDoc = {
    _id: 'company-2',
    name: 'Empresa Estable',
    rfc: 'EST010101AAA',
    address: {
      street: 'Av Siempre Viva 123',
      city: 'CDMX',
    },
    ticketStoreConfig: {
      name: 'Tienda Visible',
      address: 'Direccion ticket custom',
      phone: '5500000000',
      taxId: 'RFC-TICKET-CUSTOM',
      email: 'ticket@demo.local',
    },
    disable: false,
    async save() {
      return this;
    },
  };

  Model.findOne = async () => companyDoc;
  UsersModel.countDocuments = async () => 0;
  t.after(() => {
    Model.findOne = originalFindOne;
    UsersModel.countDocuments = originalCountDocuments;
  });

  const result = await store.update('company-2', {
    disable: true,
  });

  assert.equal(result.disable, true);
  assert.equal(result.ticketStoreConfig.name, 'Tienda Visible');
  assert.equal(result.ticketStoreConfig.taxId, 'RFC-TICKET-CUSTOM');
  assert.equal(result.ticketStoreConfig.address, 'Direccion ticket custom');
  assert.equal(result.ticketStoreConfig.phone, '5500000000');
  assert.equal(result.ticketStoreConfig.email, 'ticket@demo.local');
});

test('updateCompany actualiza telefono y email para ticket', async (t) => {
  const originalFindOne = Model.findOne;

  const companyDoc = {
    _id: 'company-3',
    name: 'Empresa Contacto',
    rfc: 'CON010101AAA',
    address: {
      street: 'Av Contacto 10',
      city: 'Monterrey',
    },
    ticketStoreConfig: {
      name: 'Empresa Contacto',
      address: 'Av Contacto 10, Monterrey',
      phone: '1111111111',
      taxId: 'CON010101AAA',
      email: 'anterior@demo.local',
    },
    disable: false,
    async save() {
      return this;
    },
  };

  Model.findOne = async () => companyDoc;
  t.after(() => {
    Model.findOne = originalFindOne;
  });

  const result = await store.update('company-3', {
    phone: '8123456789',
    email: 'nuevo@demo.local',
  });

  assert.equal(result.ticketStoreConfig.phone, '8123456789');
  assert.equal(result.ticketStoreConfig.email, 'nuevo@demo.local');
  assert.equal(result.ticketStoreConfig.name, 'Empresa Contacto');
  assert.equal(result.ticketStoreConfig.taxId, 'CON010101AAA');
});

test('updateCompany no permite desactivar empresa con usuarios activos', async (t) => {
  const originalFindOne = Model.findOne;
  const originalCountDocuments = UsersModel.countDocuments;

  const companyDoc = {
    _id: 'company-4',
    name: 'Empresa Bloqueada',
    disable: false,
    ticketStoreConfig: {},
    async save() {
      return this;
    },
  };

  Model.findOne = async () => companyDoc;
  UsersModel.countDocuments = async () => 2;

  t.after(() => {
    Model.findOne = originalFindOne;
    UsersModel.countDocuments = originalCountDocuments;
  });

  await assert.rejects(
    () => store.update('company-4', { disable: true }),
    /usuarios activos asignados/
  );
});

test('removeCompany no permite desactivar empresa con usuarios activos', async (t) => {
  const originalFindOne = Model.findOne;
  const originalCountDocuments = UsersModel.countDocuments;

  const companyDoc = {
    _id: 'company-5',
    name: 'Empresa Bloqueada Remove',
    disable: false,
    async save() {
      return this;
    },
  };

  Model.findOne = async () => companyDoc;
  UsersModel.countDocuments = async () => 1;

  t.after(() => {
    Model.findOne = originalFindOne;
    UsersModel.countDocuments = originalCountDocuments;
  });

  await assert.rejects(
    () => store.remove('company-5'),
    /usuarios activos asignados/
  );
});