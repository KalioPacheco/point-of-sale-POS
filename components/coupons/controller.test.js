const test = require('node:test');
const assert = require('node:assert/strict');

const controller = require('./controller');
const Model = require('./model');

test('validateCoupon regresa cupon valido y descuento calculado', async (t) => {
  const originalFindValidCoupon = Model.findValidCoupon;

  const fakeCoupon = {
    id: 'coupon-1',
    code: 'PROMO20',
    name: 'Promo 20',
    description: 'Descuento QA',
    discountType: 'percentage',
    discountValue: 20,
    isValidForSale: () => ({ valid: true, errors: [] }),
    calculateDiscount: () => ({
      applicableAmount: 100,
      discountAmount: 20,
      finalAmount: 80,
    }),
  };

  Model.findValidCoupon = async () => fakeCoupon;

  t.after(() => {
    Model.findValidCoupon = originalFindValidCoupon;
  });

  const result = await controller.validateCoupon('PROMO20', 'company-1', {
    subtotal: 100,
    total: 116,
  });

  assert.equal(result.valid, true);
  assert.equal(result.coupon.code, 'PROMO20');
  assert.equal(result.discount.discountAmount, 20);
});

test('validateCoupon devuelve invalid cuando faltan datos requeridos', async () => {
  const result = await controller.validateCoupon('', 'company-1', null);

  assert.equal(result.valid, false);
  assert.match(result.error, /Faltan datos requeridos/);
});

test('calculateSaleWithCoupon aplica descuento y recalcula total', async (t) => {
  const originalFindValidCoupon = Model.findValidCoupon;

  const fakeCoupon = {
    id: 'coupon-2',
    code: 'PROMO10',
    name: 'Promo 10',
    description: 'Descuento QA',
    discountType: 'fixed_amount',
    discountValue: 10,
    isValidForSale: () => ({ valid: true, errors: [] }),
    calculateDiscount: () => ({
      applicableAmount: 100,
      discountAmount: 10,
      finalAmount: 90,
    }),
  };

  Model.findValidCoupon = async () => fakeCoupon;

  t.after(() => {
    Model.findValidCoupon = originalFindValidCoupon;
  });

  const result = await controller.calculateSaleWithCoupon(
    { subtotal: 100, total: 116 },
    'PROMO10',
    'company-1'
  );

  assert.equal(result.success, true);
  assert.equal(result.saleData.discount, 10);
  assert.equal(result.saleData.total, 106);
  assert.equal(result.saleData.appliedCoupon.code, 'PROMO10');
});
