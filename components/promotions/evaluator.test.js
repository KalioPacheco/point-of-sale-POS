const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePromotions } = require('./evaluator');

const now = new Date('2026-09-08T12:00:00.000Z');
const active = extra => ({
  _id: 'promotion-1',
  company: 'company-1',
  name: 'Promoción',
  status: 'active',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-09-30T23:59:59.999Z',
  priority: 1,
  ...extra,
});

const quote = extra => evaluatePromotions({
  companyId: 'company-1',
  branchId: 'branch-1',
  now,
  products: [{ productId: 'product-1', quantity: 1, price: 100, taxRate: 16 }],
  ...extra,
});

test('elige mayor beneficio cuando la prioridad coincide y da una cotización explicable', () => {
  const result = quote({
    promotions: [
      active({ _id: 'small', benefit: { type: 'percentage', value: 10 } }),
      active({ _id: 'large', benefit: { type: 'fixed_amount', value: 20 } }),
    ],
  });

  assert.equal(result.winner.promotionId, 'large');
  assert.equal(result.promotionDiscount, 20);
  assert.equal(result.subtotal, 80);
  assert.equal(result.totalTaxes, 12.8);
  assert.equal(result.finalTotal, 92.8);
  assert.equal(result.exclusions.find(item => item.promotionId === 'small').reason, 'LOWER_BENEFIT');
});

test('una promoción de producto se prorratea por línea y reduce la base antes de impuestos', () => {
  const result = evaluatePromotions({
    companyId: 'company-1',
    now,
    products: [
      { productId: 'eligible', quantity: 1, price: 10, taxRate: 16 },
      { productId: 'other', quantity: 1, price: 15, taxRate: 0 },
    ],
    promotions: [active({
      conditions: [{ type: 'products', productIds: ['eligible'] }],
      benefit: { type: 'percentage', value: 10, scope: 'line' },
    })],
  });

  assert.equal(result.promotionDiscount, 1);
  assert.deepEqual(result.lineAllocations.map(line => line.discount), [1, 0]);
  assert.equal(result.subtotal, 24);
  assert.equal(result.totalTaxes, 1.44);
  assert.equal(result.finalTotal, 25.44);
});

test('buy_x_get_y conserva cantidades residuales y no mezcla variantes', () => {
  const result = evaluatePromotions({
    companyId: 'company-1',
    now,
    products: [
      { productId: 'product-1', variantId: 'red', quantity: 3, price: 20, taxRate: 0 },
      { productId: 'product-1', variantId: 'blue', quantity: 1, price: 20, taxRate: 0 },
    ],
    promotions: [active({
      benefit: { type: 'buy_x_get_y', buyQuantity: 1, getQuantity: 1 },
    })],
  });

  assert.equal(result.promotionDiscount, 20);
  assert.deepEqual(result.lineAllocations.map(line => line.discount), [20, 0]);
  assert.equal(result.finalTotal, 60);
});

test('precio por cantidad y 3x2 calculan grupos completos sin descontar el residuo', () => {
  const bundle = evaluatePromotions({
    companyId: 'company-1',
    now,
    products: [{ productId: 'product-1', quantity: 5, price: 9.99, taxRate: 0 }],
    promotions: [active({
      benefit: { type: 'quantity_price', quantity: 3, bundlePrice: 24 },
    })],
  });
  const threeForTwo = evaluatePromotions({
    companyId: 'company-1',
    now,
    products: [{ productId: 'product-1', quantity: 5, price: 12, taxRate: 0 }],
    promotions: [active({
      benefit: { type: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1 },
    })],
  });

  assert.equal(bundle.promotionDiscount, 5.97);
  assert.equal(bundle.finalTotal, 43.98);
  assert.equal(threeForTwo.promotionDiscount, 12);
  assert.equal(threeForTwo.finalTotal, 48);
});

test('un cupón válido no se acumula con una promoción automática y la razón queda guardada', () => {
  const result = quote({
    coupon: { valid: true, discountAmount: 50 },
    promotions: [active({ benefit: { type: 'percentage', value: 10 } })],
  });

  assert.equal(result.promotionDiscount, 10);
  assert.equal(result.couponDiscount, 0);
  assert.equal(result.coupon.applied, false);
  assert.equal(result.coupon.exclusionReason, 'COUPON_NOT_STACKABLE_WITH_PROMOTION');
});

test('explica vigencia y sucursal no elegible sin conceder descuento', () => {
  const result = quote({
    promotions: [
      active({ _id: 'future', startsAt: '2026-10-01T00:00:00.000Z', benefit: { type: 'percentage', value: 10 } }),
      active({ _id: 'other-branch', branches: ['branch-2'], benefit: { type: 'percentage', value: 10 } }),
    ],
  });

  assert.equal(result.winner, null);
  assert.equal(result.finalTotal, 116);
  assert.equal(result.exclusions.find(item => item.promotionId === 'future').reason, 'PROMOTION_NOT_STARTED');
  assert.equal(result.exclusions.find(item => item.promotionId === 'other-branch').reason, 'BRANCH_NOT_ELIGIBLE');
});
