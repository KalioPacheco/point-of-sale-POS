const test = require('node:test');
const assert = require('node:assert/strict');
const branchInventory = require('./branchInventory');
const { InventoryLevel, InventoryMovement, StockTransfer } = require('./model');

const ids = {
  company: '64b000000000000000000001',
  branch: '64b000000000000000000002',
  product: '64b000000000000000000003',
  source: '64b000000000000000000004',
  actor: '64b000000000000000000005',
  level: '64b000000000000000000006',
};

test('InventoryLevel keeps parent and variant balances as distinct unique keys', () => {
  const indexes = InventoryLevel.schema.indexes();
  assert.equal(indexes.some(([key, options]) =>
    key.company === 1 && key.branch === 1 && key.product === 1 && key.variantId === 1 && options.unique
      && options.name === 'inventory_level_unique_position_v2'), true);
  assert.deepEqual(StockTransfer.schema.path('status').enumValues,
    ['requested', 'approved', 'in_transit', 'received', 'cancelled']);
});

test('branch balance mutation records an immutable before/after movement', async (t) => {
  const session = {};
  let calls = 0;
  t.mock.method(InventoryLevel, 'findOneAndUpdate', async (_filter, update, options) => {
    calls += 1;
    assert.equal(options.session, session);
    if (calls === 1) {
      assert.ok(update.$setOnInsert);
      return { _id: ids.level, company: ids.company, branch: ids.branch, product: ids.product, onHand: 7, reserved: 0, version: 4 };
    }
    assert.deepEqual(update.$inc, { onHand: -2, reserved: 0, version: 1 });
    return { _id: ids.level, company: ids.company, branch: ids.branch, product: ids.product, onHand: 5, reserved: 0, version: 5 };
  });
  t.mock.method(InventoryMovement, 'create', async (rows, options) => {
    assert.equal(options.session, session);
    assert.equal(rows[0].type, 'sale');
    assert.equal(rows[0].before, 7);
    assert.equal(rows[0].after, 5);
    assert.equal(rows[0].quantity, -2);
    assert.equal(rows[0].version, 5);
  });

  const updated = await branchInventory.mutateLevel({
    companyId: ids.company,
    branchId: ids.branch,
    product: { _id: ids.product, reorderPoint: 3 },
    delta: -2,
    requireAvailable: true,
    type: 'sale',
    sourceType: 'sale',
    sourceId: ids.source,
    actorId: ids.actor,
  }, session);

  assert.equal(updated.onHand, 5);
  assert.equal(calls, 2);
});

test('reserved transfer stock cannot be consumed by a sale or count', async (t) => {
  t.mock.method(InventoryLevel, 'findOneAndUpdate', async () => ({
    _id: ids.level,
    company: ids.company,
    branch: ids.branch,
    product: ids.product,
    onHand: 5,
    reserved: 4,
    version: 1,
  }));
  const writes = t.mock.method(InventoryMovement, 'create', async () => {});

  await assert.rejects(branchInventory.mutateLevel({
    companyId: ids.company,
    branchId: ids.branch,
    product: { _id: ids.product },
    delta: -2,
    requireAvailable: true,
    type: 'sale',
    sourceType: 'sale',
    sourceId: ids.source,
    actorId: ids.actor,
  }, {}), { code: 'INSUFFICIENT_STOCK' });
  assert.equal(writes.mock.callCount(), 0);
});

test('counts with an observed stale version are rejected before balance writes', async (t) => {
  t.mock.method(InventoryLevel, 'findOneAndUpdate', async () => ({
    _id: ids.level,
    company: ids.company,
    branch: ids.branch,
    product: ids.product,
    onHand: 5,
    reserved: 0,
    version: 9,
  }));
  const writes = t.mock.method(InventoryMovement, 'create', async () => {});

  await assert.rejects(branchInventory.mutateLevel({
    companyId: ids.company,
    branchId: ids.branch,
    product: { _id: ids.product },
    delta: 1,
    expectedVersion: 8,
    type: 'physical_count',
    sourceType: 'physical_count',
    sourceId: ids.source,
    actorId: ids.actor,
  }, {}), { code: 'STALE_INVENTORY_VERSION' });
  assert.equal(writes.mock.callCount(), 0);
});
