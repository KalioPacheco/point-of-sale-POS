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
const { createHttpAccess } = require('../middleware/httpAccess');
const productStore = require('../components/products/store');
const cutStore = require('../components/cashRegisterCuts/store');
const movementStore = require('../components/cashMovements/store');
const ticketStore = require('../components/ticket/store');
const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');
const fs = require('fs');
const path = require('path');

async function capturePdf(generate, filename) {
  const output = new PassThrough();
  output.setHeader = () => {};
  const chunks = [];
  output.on('data', chunk => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => { output.on('end', resolve); output.on('error', reject); });
  await generate(output);
  await finished;
  const buffer = Buffer.concat(chunks);
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  if (process.env.QA_PDF_DIR) {
    fs.mkdirSync(process.env.QA_PDF_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.QA_PDF_DIR, filename), buffer);
  }
}

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

test('checkout HTTP replay binds payload and cashier and survives a closed shift', async () => {
  const f = await createFixture();
  const body = httpSalePayload(f, { products: [{ productId: f.product._id, quantity: 2 }] });
  const options = { token: tokenFor(f.cashier), method: 'POST', body,
    headers: { 'Idempotency-Key': 'bound-checkout' } };
  const results = await Promise.all([api('/sales', options), api('/sales/with-coupon', options)]);
  assert.deepEqual(results.map(r => r.status), [201, 201]);
  assert.equal(results[0].data.body.saleId, results[1].data.body.saleId);
  assert.equal(await Sale.countDocuments({ company: f.company._id }), 1);
  assert.equal((await Product.findById(f.product._id)).stock, 3);
  for (const path of ['/sales', '/sales/with-coupon']) {
    const changed = await api(path, { ...options, body: { ...body, couponCode: null } });
    assert.equal(changed.status, 409);
    const other = await User.create({ userName: `other-replay-${path.includes('coupon')}-${Date.now()}`,
      password: 'e2e-password', role: 'vendedor', company: f.company._id });
    const forbidden = await api(path, { ...options, token: tokenFor(other) });
    assert.equal(forbidden.status, 404);
    assert.equal(forbidden.data.body, '');
  }
  await CashRegisterShift.updateOne({ _id: f.shift._id }, { status: 'closed' });
  assert.equal((await api('/sales', options)).status, 201);
  // Existing snapshots support legitimate retries of pre-fingerprint sales.
  await Sale.updateOne({ _id: results[0].data.body.saleId }, { $unset: { requestFingerprint: 1 } });
  assert.equal((await api('/sales', options)).status, 201);
  assert.equal((await api('/sales', { ...options, body: { ...body, couponCode: null } })).status, 409);
  await Sale.updateOne({ _id: results[0].data.body.saleId }, { status: 'refunded', refund: true });
  assert.equal((await api('/sales', options)).status, 409);
});

test('manual cash HTTP binds open owned shift and reconciles income and expenses', async () => {
  const { f, data } = await cutFixture();
  await CashRegisterShift.updateOne({ _id: f.shift._id }, { openingCash: 100 });
  const options = { token: tokenFor(f.cashier), method: 'POST', body: {
    type: 'initial_cash', amount: 10, concept: 'QA entry',
    cashRegister: f.shift.cashRegister, shiftId: f.shift._id
  } };
  assert.equal((await api('/cash-movements/create', options)).status, 200);
  assert.equal((await api('/cash-movements/create', { ...options,
    body: { ...options.body, type: 'expense', amount: 5 } })).status, 200);
  assert.equal((await api('/cash-movements/create', { ...options,
    body: { ...options.body, shiftId: undefined } })).status, 422);
  const other = await User.create({ userName: `movement-other-${Date.now()}`, password: 'e2e-password',
    company: f.company._id, role: 'manager' });
  assert.equal((await api('/cash-movements/create', { ...options, token: tokenFor(other) })).status, 404);
  assert.equal((await api('/cash-movements/create', { ...options,
    body: { ...options.body, cashRegister: 'WRONG' } })).status, 404);
  const foreignShift = await CashRegisterShift.create({ company: f.otherCompany._id,
    cashier: f.cashier._id, cashRegister: f.shift.cashRegister, openingCash: 0 });
  assert.equal((await api('/cash-movements/create', { ...options,
    body: { ...options.body, shiftId: foreignShift._id } })).status, 404);
  // Global operations remain explicit and outside shift reconciliation.
  assert.equal((await api('/cash-movements/create', { ...options,
    body: { type: 'expense', amount: 1, concept: 'Global' } })).status, 200);
  const cut = await cutStore.createCashRegisterCut({ ...data, actualCash: 105 });
  assert.equal(cut.cut.cashControl.expectedCash, 105);
  assert.equal(cut.cut.cashControl.difference, 0);
  assert.equal((await api('/cash-movements/create', options)).status, 404);
  assert.equal(await CashMovement.countDocuments({ shift: f.shift._id }), 2);
});

test('shift ledger paginates the same scope and reconciles four payment methods and refunds', async () => {
  const { f, data } = await cutFixture();
  const payments = [
    { method: 'cash', cashReceived: 200 }, { method: 'card', reference: 'CARD' },
    { method: 'transfer', reference: 'TRANSFER' },
    { method: 'mixed', cashAmount: 50, cardAmount: 66, reference: 'MIXED' }
  ];
  let cashSale;
  for (const payment of payments) {
    const sale = await salesController.addSell(salePayload(f, { products: [{ productId: f.product._id, quantity: 1 }],
      couponCode: null, payment }), `ledger-${payment.method}`);
    if (payment.method === 'cash') cashSale = sale;
  }
  const refund = await api('/tickets/process-refund', { token: tokenFor(f.cashier), method: 'POST', body: {
    originalSaleId: cashSale._id, reason: 'QA ledger', shiftId: f.shift._id, cashRegister: f.shift.cashRegister
  } });
  assert.equal(refund.status, 200);
  for (const [type, amount] of [['initial_cash', 10], ['expense', 5]]) {
    await movementStore.createMovement({ type, amount, concept: 'QA ledger manual', userId: f.cashier._id,
      companyId: f.company._id, cashRegister: f.shift.cashRegister, shiftId: f.shift._id });
  }
  await movementStore.createMovement({ type: 'initial_cash', amount: 900, concept: 'Global excluded',
    userId: f.cashier._id, companyId: f.company._id });
  const endpoint = `/cash-movements/shift/${f.shift._id}`;
  const ledger = await api(`${endpoint}?limit=2`, { token: tokenFor(f.cashier) });
  assert.equal(ledger.status, 200);
  assert.equal(ledger.data.body.total, 7);
  assert.equal(ledger.data.body.movements.length, 2);
  assert.deepEqual(ledger.data.body.summary, { shiftId: String(f.shift._id),
    openingCash: 500, income: 176, expenses: 121, expectedCash: 555 });
  const second = await api(`${endpoint}?page=1&limit=2`, { token: tokenFor(f.cashier) });
  assert.deepEqual(second.data.body.summary, ledger.data.body.summary);
  assert.ok(second.data.body.movements.every(m => String(m.shift) === String(f.shift._id)));
  assert.ok(second.data.body.movements.every(m => !ledger.data.body.movements.some(first => first._id === m._id)));
  f.cashier.role = 'vendedor';
  await f.cashier.save();
  assert.equal((await api(endpoint, { token: tokenFor(f.cashier) })).status, 200);
  const other = await User.create({ userName: `ledger-other-${Date.now()}`, password: 'e2e-password',
    company: f.company._id, role: 'vendedor' });
  assert.equal((await api(endpoint, { token: tokenFor(other) })).status, 404);
  other.company = f.otherCompany._id;
  other.role = 'admin';
  await other.save();
  assert.equal((await api(endpoint, { token: tokenFor(other) })).status, 404);
  assert.equal((await api(`${endpoint}?limit=1000`, { token: tokenFor(f.cashier) })).status, 422);
  f.cashier.role = 'manager';
  await f.cashier.save();
  const cut = await cutStore.createCashRegisterCut({ ...data, actualCash: 555 });
  assert.equal(cut.cut.cashControl.expectedCash, ledger.data.body.summary.expectedCash);
  const printed = [];
  const originalText = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function captureText(value, ...args) {
    printed.push(String(value));
    return originalText.call(this, value, ...args);
  };
  try {
    await capturePdf(res => cutStore.generateCutPDFDirect(cut.cut._id, res), 'cut-fixed.pdf');
  } finally { PDFDocument.prototype.text = originalText; }
  assert.ok(printed.includes('POS E2E Store'));
  assert.ok(printed.some(line => line.startsWith('Transferencia: ventas $116.00')));
  assert.ok(printed.includes('Mixto / efectivo neto: $50.00'));
  assert.ok(printed.includes('Mixto / tarjeta neta: $66.00'));
  assert.ok(printed.includes('Devoluciones: $116.00'));
  assert.ok(printed.includes('Total neto: $348.00'));
  const refundTicket = await Ticket.findOne({ saleId: cashSale._id, ticketType: 'refund' });
  const refundData = await ticketStore.generateTicketData(refundTicket._id);
  assert.equal(refundData.cashier, 'E2E Cashier');
  assert.equal(refundData.storeName, 'POS E2E Store');
});

test('receipts preserve cashier identity and render both supported widths', async () => {
  const f = await createFixture();
  const sale = await salesController.addSell(salePayload(f), 'pdf-checkout');
  const ticket = await Ticket.findOne({ saleId: sale._id, ticketType: 'sale' });
  assert.equal(ticket.transactionInfo.cashier.name, 'E2E Cashier');
  assert.equal(ticket.transactionInfo.customer.name, f.customer.name);
  await User.updateOne({ _id: f.cashier._id }, { name: 'Changed name' });
  assert.equal((await ticketStore.generateTicketData(ticket._id)).cashier, 'E2E Cashier');
  for (const width of ['58mm', '80mm']) {
    await capturePdf(res => ticketStore.generateTicketPDF(ticket._id, width, res), `ticket-fixed-${width}.pdf`);
  }
  await Ticket.updateOne({ _id: ticket._id }, { $unset: { 'transactionInfo.cashier.name': 1 } });
  assert.equal((await ticketStore.generateTicketData(ticket._id)).cashier, 'Changed name');
});

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
  app.use((req, _res, next) => { req.id = require('node:crypto').randomUUID(); next(); });
  app.use(createHttpAccess('http://localhost:5173'));
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
  assert.equal(login.data.user.companyName, fixture.company.name);
  assert.equal(login.data.user.company, String(fixture.company._id));
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


test('M-09 HTTP persists campaign dates and rejects future, expired and inverted coupons', async () => {
  const { f } = await cutFixture();
  const token = tokenFor(f.cashier);
  const validFrom = new Date(Date.now() + 3600000).toISOString();
  const expirationDate = new Date(Date.now() + 86400000).toISOString();
  const created = await api('/coupons', { token, method: 'POST', body: {
    code: `FUTURE-${fixtureSequence}`, name: 'Future campaign', discountType: 'fixed_amount', discountValue: 150, validFrom, expirationDate
  } });
  assert.equal(created.status, 201);
  assert.equal(created.data.body.validFrom, validFrom);
  const id = created.data.body._id;
  const reloaded = await api(`/coupons/${id}`, { token });
  assert.equal(reloaded.data.body.validFrom, validFrom);
  const payload = httpSalePayload(f, { couponCode: created.data.body.code });
  const preview = await api('/sales/preview-with-coupon', { token, method: 'POST', body: payload });
  assert.ok(preview.status >= 400);
  const checkout = await api('/sales', { token, method: 'POST', body: payload, headers: { 'Idempotency-Key': 'future-rejected' } });
  assert.ok(checkout.status >= 400);
  assert.equal(await Sale.countDocuments({ company: f.company._id }), 0);
  const invalid = await api(`/coupons/${id}`, { token, method: 'PUT', body: { validFrom: new Date(Date.now() + 172800000).toISOString() } });
  assert.equal(invalid.status, 400);
  const start = new Date(Date.now() - 3600000).toISOString();
  const updated = await api(`/coupons/${id}`, { token, method: 'PUT', body: { validFrom: start } });
  assert.equal(updated.status, 200); assert.equal(updated.data.body.validFrom, start);
  assert.equal((await api('/sales/preview-with-coupon', { token, method: 'POST', body: payload })).status, 200);
  await Coupon.updateOne({ _id: id }, { expirationDate: new Date(Date.now() - 1) });
  assert.ok((await api('/sales/preview-with-coupon', { token, method: 'POST', body: payload })).status >= 400);
});

test('M-11 cut totals include all 65 cuts, UTC boundaries and tenant/user filters across pages', async () => {
  const { f } = await cutFixture();
  const token = tokenFor(f.cashier);
  const base = { company: f.company._id, cashier: f.cashier._id, administrator: f.cashier._id,
    cashRegister: 'RANGE', disable: false, salesSummary: { netSales: 10 }, cashControl: { difference: 2 } };
  const docs = Array.from({ length: 65 }, (_, i) => ({ ...base, shift: new mongoose.Types.ObjectId(), cutNumber: `RANGE-${i}`,
    cutDate: new Date(i === 0 ? '2026-08-01T00:00:00.000Z' : i === 64 ? '2026-08-01T23:59:59.999Z' : '2026-08-01T12:00:00Z') }));
  docs.push({ ...base, shift: new mongoose.Types.ObjectId(), cutNumber: 'OUTSIDE', cutDate: new Date('2026-08-02T00:00:00Z') });
  docs.push({ ...base, company: f.otherCompany._id, shift: new mongoose.Types.ObjectId(), cutNumber: 'OTHER', cutDate: new Date('2026-08-01T12:00:00Z') });
  await CashRegisterCut.collection.insertMany(docs);
  const query = 'startDate=2026-08-01&endDate=2026-08-01';
  const first = await api(`/cashregistercuts/reports/general?${query}&page=1&limit=50`, { token });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.deepEqual(first.data.body.summary, { totalCuts: 65, totalSales: 650, totalDifferences: 130 });
  assert.equal(first.data.body.cuts.length, 50);
  const second = await api(`/cashregistercuts/reports/general?${query}&page=2&limit=50`, { token });
  assert.equal(second.data.body.cuts.length, 15);
  assert.deepEqual(second.data.body.summary, first.data.body.summary);
  assert.equal(new Set([...first.data.body.cuts, ...second.data.body.cuts].map(c => c._id)).size, 65);
  const byUser = await cutStore.getUserCashRegisterReport(f.cashier._id, '2026-08-01', '2026-08-01', f.company._id);
  assert.equal(byUser.summary.totalCuts, 65);
  assert.equal((await cutStore.getCashRegisterReport('RANGE', '2026-08-01', '2026-08-01', f.company._id)).summary.totalCuts, 65);
  for (const invalid of ['startDate=bad', 'startDate=2026-08-02&endDate=2026-08-01', 'date=2026-02-30', 'limit=101']) {
    assert.equal((await api(`/cashregistercuts/reports/general?${invalid}`, { token })).status, 400);
  }
});

test('M-04 catalog pagination, cart IDs and sales summary stay complete with large fixtures', async () => {
  const { f } = await cutFixture();
  const token = tokenFor(f.cashier);
  const brand = new mongoose.Types.ObjectId();
  const category = new mongoose.Types.ObjectId();
  const products = Array.from({ length: 1000 }, (_, i) => ({ name: `Paged ${String(i).padStart(4, '0')}`, code: `PAGED-${i}`,
    company: f.company._id, disable: false, price: 10, stock: 10, brand, categories: [category] }));
  await Product.collection.insertMany(products);
  const query = `paginated=true&q=Paged&brand=${brand}&category=${category}&limit=25`;
  const first = await api(`/products?${query}&page=1`, { token });
  const second = await api(`/products?${query}&page=2`, { token });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.body.total, 1000); assert.equal(second.data.body.total, 1000);
  assert.equal(first.data.body.items.length, 25);
  assert.equal(new Set([...first.data.body.items, ...second.data.body.items].map(p => p._id)).size, 50);
  const ids = second.data.body.items.map(p => p._id).join(',');
  assert.equal((await api(`/products?ids=${ids}`, { token })).data.body.length, 25);
  assert.equal((await api('/products?limit=101', { token })).status, 400);
  const sale = { company: f.company._id, createdBy: f.cashier._id, disable: false, status: 'confirmed',
    createdAt: new Date('2026-08-01T12:00:00Z'), finalTotal: 10, subtotal: 10,
    products: [{ productId: f.product._id, quantity: 1, total: 10, priceSnapshot: { name: 'Paged item', price: 10 } }] };
  const sales = Array.from({ length: 60 }, (_, i) => ({ ...sale, idempotencyKey: `paged-sale-${i}` }));
  sales[0].refundInfo = { refundedAt: new Date('2026-08-02T12:00:00Z') };
  await Sale.collection.insertMany(sales);
  const report = await api('/sales/reports?paginated=true&startDate=2026-08-01&endDate=2026-08-02&limit=25&page=2', { token });
  assert.equal(report.status, 200, JSON.stringify(report.data));
  assert.equal(report.data.body.items.length, 25); assert.equal(report.data.body.total, 61);
  assert.equal(report.data.body.summary.totalVentas, 60); assert.equal(report.data.body.summary.totalDevoluciones, 1);
  assert.equal(report.data.body.summary.totalIngresos, 590); assert.equal(report.data.body.summary.promedioVenta, 10);
  assert.equal(report.data.body.topProducts[0].cantidad, 59);
  const samples = [];
  let bytes = 0;
  for (let i = 0; i < 20; i++) {
    const start = performance.now(); const result = await api(`/products?${query}&page=20`, { token });
    samples.push(performance.now() - start); bytes = Buffer.byteLength(JSON.stringify(result.data));
  }
  samples.sort((a, z) => a - z);
  console.log(`M-04 fixture: 1000 products, 60 sales + refund; catalog page 25 p95=${samples[18].toFixed(2)}ms response=${bytes} bytes (20 sequential local HTTP samples)`);
});

test('M-05 tax routes retain success and normalize not-found/conflict/internal errors with request IDs', async () => {
  const { f } = await cutFixture();
  f.cashier.role = 'admin'; await f.cashier.save();
  const token = tokenFor(f.cashier);
  const controller = require('../components/taxes/controller');
  const original = controller.listTaxConfigs;
  try {
    for (const [error, status, code] of [
      [new Error('Tax configuration not found'), 404, 'RESOURCE_NOT_FOUND'],
      [Object.assign(new Error('duplicate key'), { code: 11000 }), 409, 'DUPLICATE_RESOURCE'],
      [new Error('private database host and credentials'), 500, 'INTERNAL_ERROR']
    ]) {
      controller.listTaxConfigs = async () => { throw error; };
      const result = await api(`/taxes/config/${f.company._id}`, { token });
      assert.equal(result.status, status); assert.equal(result.data.code, code); assert.ok(result.data.requestId);
      if (status === 500) assert.equal(result.data.message, 'Internal server error');
    }
  } finally { controller.listTaxConfigs = original; }
});
