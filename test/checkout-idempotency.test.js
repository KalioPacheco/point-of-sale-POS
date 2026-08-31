const test = require('node:test');
const assert = require('node:assert/strict');
const { requestFingerprint, validateReplay } = require('../components/sales/idempotency');

const request = {
  companyId: 'company', createdBy: 'cashier', shiftId: 'shift', cashRegister: 'CAJA-1',
  products: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }],
  payment: { method: 'cash', cashReceived: 100 }, couponCode: 'SAVE', customerId: 'customer'
};
const existing = () => ({ createdBy: 'cashier', status: 'confirmed', requestFingerprint: requestFingerprint(request) });

test('checkout fingerprint ignores ordering and equivalent encodings, not purchase intent', () => {
  assert.equal(requestFingerprint(request), requestFingerprint({
    ...request, products: [...request.products].reverse(), couponCode: ' save ',
    payment: { method: 'cash', cashReceived: '100.00' }
  }));
  for (const change of [
    { customerId: 'other' }, { shiftId: 'other' }, { cashRegister: 'other' }, { couponCode: null },
    { products: [{ productId: 'p1', quantity: 1 }] },
    { products: [{ productId: 'p1', variantId: 'v1', quantity: 2 }] },
    { payment: { method: 'cash', cashReceived: 200 } },
    { payment: { method: 'card', reference: 'ref' } }
  ]) {
    assert.throws(() => validateReplay(existing(), { ...request, ...change }), { status: 409 });
  }
});

test('checkout replay checks owner before exposing intent or status', () => {
  const sale = existing();
  assert.equal(validateReplay(sale, request), sale);
  assert.throws(() => validateReplay(sale, { ...request, createdBy: 'other' }), { status: 404 });
  assert.throws(() => validateReplay({ ...sale, status: 'refunded' }, request), { status: 409 });
});
