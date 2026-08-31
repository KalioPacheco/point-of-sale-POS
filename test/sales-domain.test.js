const test = require('node:test');
const assert = require('node:assert/strict');
const sales = require('../components/sales/controller');
const Sale = require('../components/sales/model');
const User = require('../components/users/model');
const {
  validateSale,
  validateUserCreate,
  validateCustomerUpdate,
  validateCouponCreate,
  validateTaxCreate
} = require('../middleware/validation');
const { normalizeError } = require('../network');
const { counterKey, formatSequence } = require('../components/operationalCounters/model');

const ids = {
  company: '64b000000000000000000001',
  user: '64b000000000000000000002',
  shift: '64b000000000000000000003',
  product: '64b000000000000000000004',
  coupon: '64b000000000000000000005',
  customer: '64b000000000000000000006',
  sale: '64b000000000000000000007'
};

async function runValidation(middlewares, body) {
  const req = { body, params: {}, query: {} };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  for (const middleware of middlewares) {
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    if (!nextCalled) break;
  }
  return res;
}

test('cash payment calculates server-side change', () => {
  assert.deepEqual(sales.normalizePayment({ method: 'cash', cashReceived: 120 }, 116), {
    method: 'cash',
    amount: 116,
    cashReceived: 120,
    change: 4,
    cashAmount: 116,
    cardAmount: 0,
    reference: undefined
  });
});

test('cash payment rejects an underpayment', () => {
  assert.throws(
    () => sales.normalizePayment({ method: 'cash', cashReceived: 99 }, 100),
    /debe cubrir/
  );
});

test('mixed payment must equal the sale total', () => {
  assert.throws(
    () => sales.normalizePayment({
      method: 'mixed', cashAmount: 30, cardAmount: 60, reference: 'A-1'
    }, 100),
    /debe coincidir/
  );
});

test('mixed payment rejects negative component amounts', () => {
  assert.throws(
    () => sales.normalizePayment({
      method: 'mixed', cashAmount: -10, cardAmount: 110, reference: 'A-1'
    }, 100),
    /no negativos/
  );
});

test('snapshot totals use monetary rounding', () => {
  assert.deepEqual(sales.calculateSnapshotTotals([
    { subtotal: 10.01, taxAmount: 1.6016 },
    { subtotal: 20.02, taxAmount: 3.2032 }
  ]), { subtotal: 30.03, totalTaxes: 4.8, total: 34.83 });
});

test('coupon consumption filter protects both sale and customer uniqueness', () => {
  assert.deepEqual(
    sales.buildCouponUsageFilter(ids.coupon, ids.sale, ids.customer, ids.company),
    {
      _id: ids.coupon,
      company: ids.company,
      disable: false,
      status: 'active',
      $and: [
        { 'usageHistory.saleId': { $ne: ids.sale } },
        { usageHistory: { $not: { $elemMatch: { customerId: ids.customer } } } }
      ]
    }
  );
});

test('sale schema rejects missing operational context', () => {
  const validation = new Sale({
    idempotencyKey: 'attempt-1',
    company: ids.company,
    products: []
  }).validateSync();

  assert.ok(validation.errors.createdBy);
  assert.ok(validation.errors.cashRegister);
  assert.ok(validation.errors.shift);
  assert.ok(validation.errors['payment.method']);
  assert.ok(validation.errors['payment.amount']);
  assert.ok(validation.errors.products);
  assert.ok(validation.errors.finalTotal);
});

test('user schema rejects an account without tenant', () => {
  const validation = new User({
    userName: 'tenantless',
    password: 'secret123',
    role: 'admin'
  }).validateSync();

  assert.ok(validation.errors.company);
});

test('sale input rejects a client-controlled price', async () => {
  const res = await runValidation(validateSale, {
    products: [{ productId: ids.product, quantity: 1, price: 0.01 }],
    cashRegister: 'CAJA-1',
    shiftId: ids.shift,
    payment: { method: 'cash', cashReceived: 100 }
  });

  assert.equal(res.statusCode, 422);
  assert.match(JSON.stringify(res.payload), /precio es autoritativo/i);
});

test('user input rejects a client-controlled company', async () => {
  const res = await runValidation(validateUserCreate, {
    userName: 'new-user',
    password: 'secret123',
    role: 'admin',
    companyId: ids.company
  });

  assert.equal(res.statusCode, 422);
  assert.match(JSON.stringify(res.payload), /empresa se deriva/i);
});

test('partial customer update does not require create fields', async () => {
  const res = await runValidation(validateCustomerUpdate, { phone: '5551234567' });
  assert.equal(res.statusCode, 200);
});

test('coupon validation follows discount type and canonical fields', async () => {
  const fixed = await runValidation(validateCouponCreate, {
    code: 'FIXED150',
    name: 'Fixed discount',
    discountType: 'fixed_amount',
    discountValue: 150,
    expirationDate: '2030-01-01'
  });
  assert.equal(fixed.statusCode, 200);

  const percentage = await runValidation(validateCouponCreate, {
    code: 'PERCENT101',
    name: 'Invalid percentage',
    discountType: 'percentage',
    discountValue: 101,
    expirationDate: '2030-01-01'
  });
  assert.equal(percentage.statusCode, 422);
});

test('tax validation accepts defaultRate and rejects legacy rate', async () => {
  const valid = await runValidation(validateTaxCreate, {
    name: 'IVA',
    defaultRate: 16
  });
  assert.equal(valid.statusCode, 200);

  const legacy = await runValidation(validateTaxCreate, { name: 'IVA', rate: 16 });
  assert.equal(legacy.statusCode, 422);
});

test('HTTP errors classify business failures and hide internal details', () => {
  const duplicate = new Error('duplicate key');
  duplicate.code = 11000;
  assert.equal(normalizeError('Internal error', 500, new Error('Customer not found')).status, 404);
  assert.equal(normalizeError('Internal error', 500, duplicate).status, 409);
  assert.deepEqual(
    normalizeError(new Error('database password leaked'), 500, new Error('database password leaked')),
    {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: undefined
    }
  );
});

test('folio helpers scope counters and preserve padding', () => {
  assert.equal(
    counterKey({ kind: 'ticket', company: 'company-a', cashRegister: 'CAJA-1', date: '20260829' }),
    'ticket:company-a:CAJA-1:20260829:default'
  );
  assert.equal(formatSequence('TIC-CAJA-1-20260829', 12, 4), 'TIC-CAJA-1-20260829-0012');
});
