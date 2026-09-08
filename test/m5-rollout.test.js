const test = require('node:test');
const assert = require('node:assert/strict');
const {
  legacyPositions,
  reconcileInventory,
  reconcileConsolidatedInventory,
  activationBlockers,
  reportDigest,
  signReport,
  rollbackBlockers,
} = require('../scripts/m5-rollout-lib');

const product = (id, stock) => ({ _id: id, stock, hasVariants: false });

test('M5 reconciles exact MATRIZ balances and detects missing movements', () => {
  const products = [product('parent', 3), {
    _id: 'with-variants', hasVariants: true,
    variants: [{ _id: 'red', stock: 2, active: true }, { _id: 'old', stock: 9, active: false }],
  }];
  const levels = [
    { product: 'parent', onHand: 3 },
    { product: 'with-variants', variantId: 'red', onHand: 2 },
  ];
  const openingMovements = [
    { product: 'parent', quantity: 3, after: 3 },
    { product: 'with-variants', variantId: 'red', quantity: 2, after: 2 },
  ];
  assert.deepEqual(legacyPositions(products).map(item => item.key), ['parent:', 'with-variants:red']);
  assert.equal(reconcileInventory({ products, levels, openingMovements }).matches, true);
  assert.equal(reconcileConsolidatedInventory({
    products,
    levels: [{ product: 'parent', onHand: 1 }, { product: 'parent', onHand: 2 }, { product: 'with-variants', variantId: 'red', onHand: 2 }],
  }).matches, true);

  const mismatch = reconcileInventory({ products, levels: levels.slice(0, 1), openingMovements });
  assert.deepEqual(mismatch.missingLevels, ['with-variants:red']);
  assert.equal(mismatch.matches, false);
});

test('M5 activation is blocked by any unexplained operational discrepancy', () => {
  const inventory = { matches: true };
  assert.deepEqual(activationBlockers({
    migrationsApplied: true, matrizCount: 1, historicalAttribution: 0, inventory,
    openShifts: 0, inTransitTransfers: 0, unapprovedCutDifferences: 0,
  }), []);
  assert.deepEqual(activationBlockers({
    migrationsApplied: false, matrizCount: 2, historicalAttribution: 1, inventory: { matches: false },
    openShifts: 1, inTransitTransfers: 1, unapprovedCutDifferences: 1,
  }), [
    'MIGRATIONS_002_003_PENDING', 'MATRIZ_MISSING_OR_AMBIGUOUS', 'HISTORICAL_BRANCH_ATTRIBUTION_PENDING',
    'INVENTORY_RECONCILIATION_FAILED', 'OPEN_SHIFTS_MUST_BE_CLOSED', 'TRANSFERS_IN_TRANSIT',
    'UNAPPROVED_CUT_DIFFERENCES',
  ]);
});

test('M5 reports have a deterministic digest and require zero post-activation inventory activity to roll back', () => {
  const report = { company: { id: 'c1' }, inventory: { matches: true }, generatedAt: '2026-09-08T00:00:00.000Z' };
  assert.equal(reportDigest(report), reportDigest({ generatedAt: report.generatedAt, inventory: report.inventory, company: report.company }));
  assert.equal(signReport(report, 'pilot-key').signed, true);
  assert.deepEqual(rollbackBlockers({
    stage: 'inventory', activation: { executedAt: new Date() }, postActivationInventoryMovements: 1,
    postActivationSales: 0, postActivationTransfers: 0,
  }), ['POST_ACTIVATION_INVENTORY_MOVEMENTS']);
  assert.deepEqual(rollbackBlockers({
    stage: 'promotions', activation: null, postActivationInventoryMovements: 4,
    postActivationSales: 2, postActivationTransfers: 1,
  }), []);
});
