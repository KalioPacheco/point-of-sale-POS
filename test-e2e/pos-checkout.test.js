const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();
process.env.JWT_SECRET = 'pos-e2e-jwt-secret-not-for-production';

const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const salesController = require('../components/sales/controller');
const Company = require('../components/companies/model');
const User = require('../components/users/model');
const Customer = require('../components/customer/model');
const { Product, StockHistory } = require('../components/products/model');
const Coupon = require('../components/coupons/model');
const CashRegisterShift = require('../components/cashRegisterShifts/model');
const CashRegisterCut = require('../components/cashRegisterCuts/model');
const CashMovement = require('../components/cashMovements/model');
const Sale = require('../components/sales/model');
const Ticket = require('../components/ticket/model');
const routes = require('../routes');
const productStore = require('../components/products/store');
const cutStore = require('../components/cashRegisterCuts/store');
const movementStore = require('../components/cashMovements/store');

async function cutFixture() {
  const f = await createFixture();
  f.cashier.role = 'manager';
  await f.cashier.save();
  return { f, data: {
    shiftId: f.shift._id, companyId: f.company._id,
    cashRegister: f.shift.cashRegister, administratorId: f.cashier._id, actualCash: 500
  } };
}

mongoose.set('strictQuery', true);

const databaseName = `pos_e2e_${Date.now()}_${process.pid}`;
let fixtureSequence = 0;
let httpServer;
let baseUrl;

function ephemeralMongoUri() {
  const raw = process.env.DB_CONECTION_DEV;
  if (!raw) throw new Error('DB_CONECTION_DEV is required for E2E tests');
  if (/[<>]/.test(raw)) {
    throw new Error('DB_CONECTION_DEV still contains a <placeholder>; configure real credentials');
  }

  const uri = new URL(raw);
  uri.pathname = `/${databaseName}`;
  if (!uri.searchParams.has('authSource')) uri.searchParams.set('authSource', 'admin');
  return uri.toString();
}

async function createFixture() {
  fixtureSequence += 1;
  const [company, otherCompany] = await Company.create([
    { name: 'POS E2E Store', rfc: 'E2E010101AAA' },
    { name: 'Other Tenant', rfc: 'E2E010101BBB' }
  ]);
  const cashier = await User.create({
    userName: `cashier-${process.pid}-${fixtureSequence}`,
    password: 'e2e-password',
    name: 'E2E Cashier',
    role: 'vendedor',
    company: company._id
  });
  const customer = await Customer.create({
    name: 'E2E Customer',
    company: company._id,
    createdBy: cashier._id
  });
  const [product, foreignProduct] = await Product.create([
    {
      name: 'Authoritative product',
      code: `E2E-A-${process.pid}-${fixtureSequence}`,
      price: 100,
      cost: 50,
      stock: 5,
      taxRate: 16,
      company: company._id,
      createdBy: cashier._id
    },
    {
      name: 'Foreign product',
      code: `E2E-B-${process.pid}-${fixtureSequence}`,
      price: 1,
      stock: 10,
      company: otherCompany._id,
      createdBy: cashier._id
    }
  ]);
  const coupon = await Coupon.create({
    code: `E2E10${process.pid}${fixtureSequence}`,
    name: 'E2E ten percent',
    discountType: 'percentage',
    discountValue: 10,
    expirationDate: new Date(Date.now() + 86400000),
    company: company._id,
    createdBy: cashier._id
  });
  const shift = await CashRegisterShift.create({
    company: company._id,
    cashRegister: 'E2E-REGISTER-1',
    cashier: cashier._id,
    openingCash: 500
  });

  return { company, otherCompany, cashier, customer, product, foreignProduct, coupon, shift };
}

function salePayload(fixture, overrides = {}) {
  return {
    companyId: fixture.company._id,
    createdBy: fixture.cashier._id,
    customerId: fixture.customer._id,
    cashRegister: fixture.shift.cashRegister,
    shiftId: fixture.shift._id,
    products: [{
      productId: fixture.product._id,
      quantity: 2,
      price: 0.01
    }],
    couponCode: fixture.coupon.code,
    payment: { method: 'cash', cashReceived: 250 },
    ...overrides
  };
}

function httpSalePayload(fixture, overrides = {}) {
  const { companyId: _companyId, createdBy: _createdBy, ...payload } = salePayload(fixture, overrides);
  return payload;
}

function tokenFor(user) {
  return jwt.sign({
    userId: user._id,
    userName: user.userName,
    company: user.company,
    role: user.role
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

async function api(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = response.headers.get('content-type')?.includes('json')
    ? await response.json()
    : await response.text();
  return { status: response.status, data };
}

test('manual stock adjustments serialize concurrent increments and retries', async () => {
  const f = await createFixture();
  const args = [f.product._id, 2, f.cashier._id, 'QA adjustment', f.company._id];
  await Promise.all([
    productStore.addStock(...args, { idempotencyKey: 'same-adjustment' }),
    productStore.addStock(...args, { idempotencyKey: 'same-adjustment' }),
    productStore.addStock(f.product._id, 3, f.cashier._id, 'Other adjustment', f.company._id)
  ]);
  assert.equal((await Product.findById(f.product._id)).stock, 10);
  assert.equal(await StockHistory.countDocuments({ product: f.product._id }), 2);
  await assert.rejects(productStore.addStock(f.product._id, 9, f.cashier._id, 'QA adjustment',
    f.company._id, { idempotencyKey: 'same-adjustment' }), /already used/);
  await assert.rejects(productStore.setStock(f.product._id, 20, f.cashier._id, 'Count',
    f.company._id, { expectedStock: 5 }), /Stock conflict/);
  await productStore.setStock(f.product._id, 0, f.cashier._id, 'Count',
    f.company._id, { expectedStock: 10 });
  const history = await StockHistory.findOne({ product: f.product._id, type: 'set' });
  assert.equal(history.previousStock, 10);
  assert.equal(history.newStock, 0);
  assert.equal(String(history.user), String(f.cashier._id));
});

test('manual stock history failure rolls back product and permits safe retry', async () => {
  const f = await createFixture();
  const originalCreate = StockHistory.create;
  StockHistory.create = async () => { throw new Error('Injected history failure'); };
  try {
    await assert.rejects(productStore.reduceStock(f.product._id, 2, f.cashier._id,
      'QA failure', f.company._id, { idempotencyKey: 'rollback' }), /Injected/);
  } finally { StockHistory.create = originalCreate; }
  assert.equal((await Product.findById(f.product._id)).stock, 5);
  assert.equal(await StockHistory.countDocuments({ product: f.product._id }), 0);
  const args = [f.product._id, 2, f.cashier._id, 'QA failure', f.company._id, { idempotencyKey: 'rollback' }];
  await productStore.reduceStock(...args);
  await productStore.reduceStock(...args);
  assert.equal((await Product.findById(f.product._id)).stock, 3);
  assert.equal(await StockHistory.countDocuments({ product: f.product._id }), 1);
});

test('manual stock HTTP validates role, tenant, actor and stale absolute adjustments', async () => {
  const f = await createFixture();
  const path = `/products/${f.product._id}/stock/set`;
  assert.equal((await api(path, { token: tokenFor(f.cashier), method: 'PUT', body: { quantity: 2 } })).status, 403);
  f.cashier.role = 'manager';
  await f.cashier.save();
  const token = tokenFor(f.cashier);
  assert.equal((await api(`/products/${f.foreignProduct._id}/stock/add`, {
    token, method: 'PUT', body: { quantity: 1 }
  })).status, 404);
  assert.equal((await api(path, { token, method: 'PUT', body: { quantity: '2' } })).status, 400);
  assert.equal((await api(path, { token, method: 'PUT', body: { quantity: 2, expectedStock: 99 } })).status, 409);
  const request = { token, method: 'PUT', body: { quantity: 2, expectedStock: 5 }, headers: { 'Idempotency-Key': 'http-set' } };
  assert.equal((await api(path, request)).status, 200);
  assert.equal((await api(path, request)).status, 200);
  assert.equal(await StockHistory.countDocuments({ product: f.product._id, user: f.cashier._id }), 1);
});

test('cut rollback includes the persisted cut when final shift save fails', async () => {
  const { f, data } = await cutFixture();
  const originalSave = CashRegisterShift.prototype.save;
  CashRegisterShift.prototype.save = async function injectedSave(options) {
    if (this.cutStatus === 'completed') throw new Error('Injected final shift failure');
    return originalSave.call(this, options);
  };
  try {
    await assert.rejects(cutStore.createCashRegisterCut(data), /Injected final shift failure/);
  } finally { CashRegisterShift.prototype.save = originalSave; }
  assert.equal(await CashRegisterCut.countDocuments({ shift: f.shift._id }), 0);
  assert.equal((await CashRegisterShift.findById(f.shift._id)).status, 'open');
  const results = await Promise.all([
    cutStore.createCashRegisterCut(data), cutStore.createCashRegisterCut(data)
  ]);
  assert.equal(String(results[0].cut._id), String(results[1].cut._id));
  assert.equal(await CashRegisterCut.countDocuments({ shift: f.shift._id }), 1);
  const closed = await CashRegisterShift.findById(f.shift._id);
  assert.equal(closed.cutStatus, 'completed');
  assert.equal(String(closed.cut), String(results[0].cut._id));
  const replay = await api('/cashregistercuts/create', {
    token: tokenFor(f.cashier), method: 'POST',
    body: { shiftId: f.shift._id, cashRegister: f.shift.cashRegister, actualCash: 500 }
  });
  assert.equal(replay.status, 200);
  assert.equal(String(replay.data.body.cut._id), String(closed.cut));
});

test('legacy partial cut is recalculated and completed without a duplicate', async () => {
  const { f, data } = await cutFixture();
  const original = await cutStore.createCashRegisterCut(data);
  await CashRegisterShift.updateOne({ _id: f.shift._id }, { $set: { cutStatus: 'pending' }, $unset: { cut: 1 } });
  await CashRegisterCut.updateOne({ _id: original.cut._id }, { $set: { 'salesSummary.totalSales': 999 } });
  const repaired = await cutStore.createCashRegisterCut(data);
  assert.equal(String(repaired.cut._id), String(original.cut._id));
  assert.equal(repaired.cut.salesSummary.totalSales, 0);
  assert.equal((await CashRegisterShift.findById(f.shift._id)).cutStatus, 'completed');
});

test('sale racing a cut is included or rejected, never committed outside the cut', async () => {
  const { f, data } = await cutFixture();
  const payload = salePayload(f, { couponCode: null, products: [{ productId: f.product._id, quantity: 1 }],
    payment: { method: 'cash', cashReceived: 116 } });
  const [sale, cut] = await Promise.allSettled([
    salesController.addSell(payload, 'race-cut'), cutStore.createCashRegisterCut(data)
  ]);
  assert.equal(cut.status, 'fulfilled');
  const count = await Sale.countDocuments({ shift: f.shift._id });
  assert.equal(cut.value.cut.salesSummary.salesCount, count);
  assert.equal(cut.value.cut.salesSummary.totalSales, count * 116);
  if (sale.status === 'rejected') assert.match(sale.reason.message, /No open shift/);
  assert.equal((await Product.findById(f.product._id)).stock, 5 - count);
});

test('manual cash movement racing a cut is included or rejected atomically', async () => {
  const { f, data } = await cutFixture();
  const [movement, cut] = await Promise.allSettled([
    movementStore.createMovement({ type: 'initial_cash', amount: 10, concept: 'QA cash',
      userId: f.cashier._id, companyId: f.company._id, cashRegister: f.shift.cashRegister, shiftId: f.shift._id }),
    cutStore.createCashRegisterCut(data)
  ]);
  assert.equal(cut.status, 'fulfilled');
  const count = await CashMovement.countDocuments({ shift: f.shift._id, type: 'initial_cash' });
  assert.equal(cut.value.cut.cashControl.totalMovements, count * 10);
  if (movement.status === 'rejected') assert.match(movement.reason.message, /Open shift not found/);
});

test('refund racing a cut cannot change its totals after finalization', async () => {
  const { f, data } = await cutFixture();
  const sale = await salesController.addSell(salePayload(f, {
    couponCode: null, products: [{ productId: f.product._id, quantity: 1 }],
    payment: { method: 'cash', cashReceived: 116 }
  }), 'refund-cut-sale');
  const ticketStore = require('../components/ticket/store');
  const [refund, cut] = await Promise.allSettled([
    ticketStore.processRefundTicket({ originalSaleId: sale._id, reason: 'QA refund',
      shiftId: f.shift._id, cashRegister: f.shift.cashRegister }, f.cashier._id, f.company._id),
    cutStore.createCashRegisterCut(data)
  ]);
  assert.equal(cut.status, 'fulfilled');
  const refunded = (await Sale.findById(sale._id)).status === 'refunded';
  assert.equal(cut.value.cut.salesSummary.netSales, refunded ? 0 : 116);
  assert.equal(cut.value.cut.salesSummary.refundsCount, refunded ? 1 : 0);
  assert.equal((await Product.findById(f.product._id)).stock, refunded ? 5 : 4);
  if (refund.status === 'rejected') assert.match(refund.reason.message, /open cashier shift/);
});

test.before(async () => {
  await mongoose.connect(ephemeralMongoUri(), { serverSelectionTimeoutMS: 15000 });
  assert.match(mongoose.connection.name, /^pos_e2e_/);
  await mongoose.connection.syncIndexes();

  const app = express();
  app.use(express.json());
  app.use(passport.initialize());
  routes(app);
  await new Promise(resolve => {
    httpServer = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

test.after(async () => {
  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close(error => error ? reject(error) : resolve());
    });
  }
  if (mongoose.connection.readyState) {
    assert.match(mongoose.connection.name, /^pos_e2e_/);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('checkout is atomic, authoritative and idempotent', async () => {
  const fixture = await createFixture();
  fixture.company.ticketStoreConfig = {
    name: 'Sucursal QA', address: 'Direccion ticket QA', phone: '5551234567',
    email: 'qa@example.com', taxId: 'QA010101AAA'
  };
  await fixture.company.save();
  const idempotencyKey = `checkout-${process.pid}`;
  const result = await salesController.addSell(salePayload(fixture), idempotencyKey);

  assert.equal(result.subtotal, 200);
  assert.equal(result.totalTaxes, 32);
  assert.equal(result.total, 232);
  assert.equal(result.couponDiscount, 20);
  assert.equal(result.finalTotal, 212);
  assert.equal(result.change, 38);
  assert.equal(result.products[0].priceSnapshot.price, 100);

  const [updatedProduct, coupon, movement, ticket] = await Promise.all([
    Product.findById(fixture.product._id),
    Coupon.findById(fixture.coupon._id),
    CashMovement.findOne({ saleReference: result._id }),
    Ticket.findOne({ saleId: result._id, ticketType: 'sale' })
  ]);
  assert.equal(updatedProduct.stock, 3);
  assert.equal(coupon.usageHistory.length, 1);
  assert.equal(movement.amount, 212);
  assert.equal(ticket.totals.total, 212);
  assert.equal(ticket.storeInfo.name, 'Sucursal QA');
  assert.equal(ticket.storeInfo.address, 'Direccion ticket QA');
  assert.equal(ticket.storeInfo.phone, '5551234567');
  assert.equal(ticket.storeInfo.email, 'qa@example.com');
  assert.equal(ticket.storeInfo.taxId, 'QA010101AAA');

  const retry = await salesController.addSell(salePayload(fixture), idempotencyKey);
  assert.equal(String(retry._id), String(result._id));
  assert.equal(await Sale.countDocuments({ company: fixture.company._id }), 1);
  assert.equal((await Product.findById(fixture.product._id)).stock, 3);
  assert.equal(await StockHistory.countDocuments({ product: fixture.product._id }), 1);
});

test('logout revokes the access token and a fresh login restores access', async () => {
  const fixture = await createFixture();
  const token = tokenFor(fixture.cashier);
  assert.equal((await api('/products', { token })).status, 200);
  assert.equal((await api('/users/logout', { token, method: 'POST' })).status, 200);
  assert.equal((await api('/products', { token })).status, 401);
  const login = await api('/users/login', {
    method: 'POST',
    body: { userName: fixture.cashier.userName, password: 'e2e-password' }
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.session.refreshSupported, false);
  assert.equal(jwt.decode(login.data.token).tokenVersion, 1);
  assert.equal((await api('/products', { token: login.data.token })).status, 200);
});

test('tenant and coupon failures roll back without side effects', async () => {
  const fixture = await createFixture();
  const initialSaleCount = await Sale.countDocuments();

  await assert.rejects(
    salesController.addSell(salePayload(fixture, {
      products: [{ productId: fixture.foreignProduct._id, quantity: 1 }],
      couponCode: null
    }), `foreign-${process.pid}`),
    /not found in company/
  );
  await assert.rejects(
    salesController.addSell(salePayload(fixture, {
      couponCode: 'DOES-NOT-EXIST'
    }), `coupon-failure-${process.pid}`),
    /no encontrado|no válido/i
  );

  assert.equal(await Sale.countDocuments(), initialSaleCount);
  assert.equal((await Product.findById(fixture.product._id)).stock, 5);
  assert.equal((await Product.findById(fixture.foreignProduct._id)).stock, 10);
});

test('two concurrent checkouts cannot sell the last unit twice', async () => {
  const fixture = await createFixture();
  const lastUnit = await Product.create({
    name: 'Last unit',
    code: `E2E-LAST-${process.pid}-${fixtureSequence}`,
    price: 25,
    stock: 1,
    company: fixture.company._id,
    createdBy: fixture.cashier._id
  });
  const payload = salePayload(fixture, {
    customerId: undefined,
    couponCode: null,
    products: [{ productId: lastUnit._id, quantity: 1 }],
    payment: { method: 'cash', cashReceived: 25 }
  });

  const results = await Promise.allSettled([
    salesController.addSell(payload, `race-a-${process.pid}`),
    salesController.addSell(payload, `race-b-${process.pid}`)
  ]);

  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await Product.findById(lastUnit._id)).stock, 0);
  assert.equal(await Sale.countDocuments({ 'products.productId': lastUnit._id }), 1);
});

test('concurrent folio generation is unique and tenant scoped', async () => {
  const fixture = await createFixture();
  const attempts = Array.from({ length: 25 });
  const [tickets, movements, cuts] = await Promise.all([
    Promise.all(attempts.map(() => Ticket.generateTicketNumber(
      'sale', fixture.shift.cashRegister, fixture.company._id
    ))),
    Promise.all(attempts.map(() => CashMovement.generateMovementNumber(
      fixture.company._id, fixture.shift.cashRegister
    ))),
    Promise.all(attempts.map(() => CashRegisterCut.generateCutNumber(
      fixture.shift.cashRegister, fixture.company._id
    )))
  ]);

  assert.equal(new Set(tickets).size, attempts.length);
  assert.equal(new Set(movements).size, attempts.length);
  assert.equal(new Set(cuts).size, attempts.length);

  const foreignTicket = await Ticket.generateTicketNumber(
    'sale', fixture.shift.cashRegister, fixture.otherCompany._id
  );
  assert.notEqual(foreignTicket, tickets[0]);
  assert.match(foreignTicket, /-0001$/);
  const otherRegisterMovement = await CashMovement.generateMovementNumber(
    fixture.company._id, 'E2E-REGISTER-2'
  );
  assert.ok(!movements.includes(otherRegisterMovement));
});

test('HTTP contract enforces JWT, authoritative pricing and tenant ownership', async () => {
  const fixture = await createFixture();
  const [admin, foreignAdmin, otherCashier, manager] = await User.create([
    {
      userName: `admin-${process.pid}-${fixtureSequence}`,
      password: 'e2e-password',
      role: 'admin',
      company: fixture.company._id
    },
    {
      userName: `foreign-admin-${process.pid}-${fixtureSequence}`,
      password: 'e2e-password',
      role: 'admin',
      company: fixture.otherCompany._id
    },
    {
      userName: `other-cashier-${process.pid}-${fixtureSequence}`,
      password: 'e2e-password',
      role: 'vendedor',
      company: fixture.company._id
    },
    {
      userName: `http-manager-${process.pid}-${fixtureSequence}`,
      password: 'e2e-password',
      role: 'manager',
      company: fixture.company._id
    }
  ]);
  const cashierToken = tokenFor(fixture.cashier);

  const unauthenticated = await api('/products');
  assert.equal(unauthenticated.status, 401);

  const manipulated = await api('/sales', {
    method: 'POST',
    token: cashierToken,
    headers: { 'Idempotency-Key': `http-tampered-${process.pid}` },
    body: httpSalePayload(fixture, {
      couponCode: null,
      products: [{ productId: fixture.product._id, quantity: 1, price: 0.01 }],
      payment: { method: 'cash', cashReceived: 116 }
    })
  });
  assert.equal(manipulated.status, 422);
  assert.match(JSON.stringify(manipulated.data), /precio es autoritativo/i);

  const checkout = await api('/sales', {
    method: 'POST',
    token: cashierToken,
    headers: { 'Idempotency-Key': `http-checkout-${process.pid}` },
    body: httpSalePayload(fixture, {
      couponCode: null,
      products: [{ productId: fixture.product._id, quantity: 1 }],
      payment: { method: 'cash', cashReceived: 116 }
    })
  });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.data.body.finalTotal, 116);

  const ownSales = await api('/sales', { token: cashierToken });
  assert.equal(ownSales.status, 200);
  assert.equal(ownSales.data.body.length, 1);
  assert.equal(String(ownSales.data.body[0]._id), String(checkout.data.body.saleId));

  const otherCashierSales = await api('/sales', { token: tokenFor(otherCashier) });
  assert.equal(otherCashierSales.status, 200);
  assert.equal(otherCashierSales.data.body.length, 0);

  const ownTicket = await api(
    `/tickets/${checkout.data.body.saleId}?format=80mm`,
    { token: cashierToken }
  );
  assert.equal(ownTicket.status, 200);

  const otherCashierTicket = await api(
    `/tickets/${checkout.data.body.saleId}?format=80mm`,
    { token: tokenFor(otherCashier) }
  );
  assert.equal(otherCashierTicket.status, 404);

  const foreignTicket = await api(
    `/tickets/${checkout.data.body.saleId}?format=80mm`,
    { token: tokenFor(foreignAdmin) }
  );
  assert.equal(foreignTicket.status, 404);

  const sellerDeleteCustomer = await api(`/customer/${fixture.customer._id}`, {
    method: 'DELETE',
    token: cashierToken
  });
  assert.equal(sellerDeleteCustomer.status, 403);

  const managerDeleteCustomer = await api(`/customer/${fixture.customer._id}`, {
    method: 'DELETE',
    token: tokenFor(manager)
  });
  assert.equal(managerDeleteCustomer.status, 200);

  const manualTicket = await api('/tickets', {
    method: 'POST',
    token: tokenFor(admin),
    body: { total: 1 }
  });
  assert.equal(manualTicket.status, 410);

  const injectedTenant = await api('/users/register', {
    method: 'POST',
    token: tokenFor(admin),
    body: {
      userName: `injected-${process.pid}`,
      password: 'e2e-password',
      role: 'admin',
      companyId: fixture.otherCompany._id
    }
  });
  assert.equal(injectedTenant.status, 422);
  assert.match(JSON.stringify(injectedTenant.data), /empresa se deriva/i);
});

test('HTTP role matrix protects operational and administrative modules', async () => {
  const fixture = await createFixture();
  const [manager, admin] = await User.create([
    {
      userName: `matrix-manager-${process.pid}-${fixtureSequence}`,
      password: 'e2e-password',
      role: 'manager',
      company: fixture.company._id
    },
    {
      userName: `matrix-admin-${process.pid}-${fixtureSequence}`,
      password: 'e2e-password',
      role: 'admin',
      company: fixture.company._id
    }
  ]);
  const tokens = {
    vendedor: tokenFor(fixture.cashier),
    manager: tokenFor(manager),
    admin: tokenFor(admin)
  };
  const everyRole = ['vendedor', 'manager', 'admin'];
  const supervisors = ['manager', 'admin'];
  const matrix = [
    { path: '/products', allowed: everyRole },
    { path: '/categories', allowed: everyRole },
    { path: '/customer', allowed: everyRole },
    {
      path: `/cash-register-shifts/current?cashRegister=${fixture.shift.cashRegister}`,
      allowed: everyRole
    },
    { path: '/brands', allowed: supervisors },
    { path: '/coupons', allowed: supervisors },
    { path: '/sales/reports', allowed: supervisors },
    { path: '/cash-movements', allowed: supervisors },
    { path: '/cashregistercuts', allowed: supervisors },
    { path: '/tickets', allowed: supervisors },
    { path: '/cash-register-shifts/pending-cuts', allowed: supervisors },
    { path: '/users', allowed: ['admin'] },
    { path: '/companies', allowed: ['admin'] },
    { path: '/userTypes', allowed: ['admin'] },
    { path: `/taxes/config/${fixture.company._id}`, allowed: ['admin'] }
  ];

  await Promise.all(matrix.flatMap(entry => everyRole.map(async role => {
    const result = await api(entry.path, { token: tokens[role] });
    const expected = entry.allowed.includes(role) ? 200 : 403;
    assert.equal(
      result.status,
      expected,
      `${role} ${entry.path}: expected ${expected}, received ${result.status}`
    );
  })));
});

test('refund restores inventory and coupon exactly once', async () => {
  const fixture = await createFixture();
  const manager = await User.create({
    userName: `refund-manager-${process.pid}-${fixtureSequence}`,
    password: 'e2e-password',
    role: 'manager',
    company: fixture.company._id
  });
  const refundShift = await CashRegisterShift.create({
    company: fixture.company._id,
    cashRegister: `E2E-REFUND-${fixtureSequence}`,
    cashier: manager._id,
    openingCash: 300
  });
  const sale = await salesController.addSell(
    salePayload(fixture),
    `refund-origin-${process.pid}-${fixtureSequence}`
  );

  const refund = await api('/tickets/process-refund', {
    method: 'POST',
    token: tokenFor(manager),
    body: {
      originalSaleId: sale._id,
      reason: 'E2E return',
      shiftId: refundShift._id,
      cashRegister: refundShift.cashRegister
    }
  });
  assert.equal(refund.status, 200);

  const [refundedSale, product, coupon, saleTicket, refundTicket, refundMovement] =
    await Promise.all([
      Sale.findById(sale._id),
      Product.findById(fixture.product._id),
      Coupon.findById(fixture.coupon._id),
      Ticket.findOne({ saleId: sale._id, ticketType: 'sale' }),
      Ticket.findOne({ saleId: sale._id, ticketType: 'refund' }),
      CashMovement.findOne({ saleReference: sale._id, type: 'refund' })
    ]);
  assert.equal(refundedSale.status, 'refunded');
  assert.equal(product.stock, 5);
  assert.equal(coupon.usageHistory.length, 0);
  assert.equal(saleTicket.status, 'refunded');
  assert.ok(refundTicket);
  assert.equal(refundMovement.amount, 212);

  const duplicateRefund = await api('/tickets/process-refund', {
    method: 'POST',
    token: tokenFor(manager),
    body: {
      originalSaleId: sale._id,
      reason: 'Duplicate E2E return',
      shiftId: refundShift._id
    }
  });
  assert.equal(duplicateRefund.status, 409);
  assert.equal(duplicateRefund.data.code, 'CONFLICT');
  assert.equal((await Product.findById(fixture.product._id)).stock, 5);
  assert.equal(await Ticket.countDocuments({ saleId: sale._id, ticketType: 'refund' }), 1);
});

test('seller requests closing, manager approves cut and closed shift rejects checkout', async () => {
  const fixture = await createFixture();
  const manager = await User.create({
    userName: `cut-manager-${process.pid}-${fixtureSequence}`,
    password: 'e2e-password',
    role: 'manager',
    company: fixture.company._id
  });
  const sale = await salesController.addSell(salePayload(fixture, {
    customerId: undefined,
    couponCode: null,
    products: [{ productId: fixture.product._id, quantity: 1 }],
    payment: { method: 'cash', cashReceived: 116 }
  }), `cut-sale-${process.pid}-${fixtureSequence}`);
  assert.equal(sale.finalTotal, 116);

  const sellerCut = await api('/cashregistercuts/create', {
    method: 'POST',
    token: tokenFor(fixture.cashier),
    body: {
      cashRegister: fixture.shift.cashRegister,
      shiftId: fixture.shift._id,
      actualCash: 616
    }
  });
  assert.equal(sellerCut.status, 403);

  const closeRequest = await api(`/cash-register-shifts/${fixture.shift._id}/close`, {
    method: 'POST',
    token: tokenFor(fixture.cashier),
    body: { closingCash: 616 }
  });
  assert.equal(closeRequest.status, 200);
  assert.equal(closeRequest.data.body.status, 'closed');
  assert.equal(closeRequest.data.body.cutStatus, 'pending');

  const pendingCuts = await api('/cash-register-shifts/pending-cuts', {
    token: tokenFor(manager)
  });
  assert.equal(pendingCuts.status, 200);
  assert.equal(pendingCuts.data.body.length, 1);
  assert.equal(String(pendingCuts.data.body[0]._id), String(fixture.shift._id));

  const cut = await api('/cashregistercuts/create', {
    method: 'POST',
    token: tokenFor(manager),
    body: {
      cashRegister: fixture.shift.cashRegister,
      shiftId: fixture.shift._id
    }
  });
  assert.equal(cut.status, 200);
  assert.equal(cut.data.body.cut.salesSummary.totalSales, 116);
  assert.equal(cut.data.body.cut.salesSummary.cash.net, 116);
  assert.equal(cut.data.body.cut.cashControl.expectedCash, 616);
  assert.equal(cut.data.body.cut.cashControl.difference, 0);

  const completedShift = await CashRegisterShift.findById(fixture.shift._id);
  assert.equal(completedShift.status, 'closed');
  assert.equal(completedShift.cutStatus, 'completed');
  assert.equal(String(completedShift.cut), String(cut.data.body.cut._id));

  const rejectedCheckout = await api('/sales', {
    method: 'POST',
    token: tokenFor(fixture.cashier),
    headers: { 'Idempotency-Key': `closed-shift-${process.pid}` },
    body: httpSalePayload(fixture, {
      couponCode: null,
      products: [{ productId: fixture.product._id, quantity: 1 }],
      payment: { method: 'cash', cashReceived: 116 }
    })
  });
  assert.equal(rejectedCheckout.status, 400);
  assert.match(JSON.stringify(rejectedCheckout.data), /No open shift/i);
});
