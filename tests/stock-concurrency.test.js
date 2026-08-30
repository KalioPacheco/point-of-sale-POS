const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { Product, StockHistory } = require('../components/products/model');
const store = require('../components/products/store');

test('manual stock writes product and history in the same transaction', async (t) => {
  const session = { withTransaction: fn => fn(), endSession: async () => {} };
  t.mock.method(mongoose, 'startSession', async () => session);
  t.mock.method(Product, 'findOne', filter => ({
    session: async passedSession => {
      assert.equal(filter.company, 'tenant');
      assert.equal(passedSession, session);
      return { _id: 'p1', name: 'Product', stock: 4, save: async options => {
        assert.equal(options.session, session);
      } };
    }
  }));
  t.mock.method(StockHistory, 'create', async (rows, options) => {
    assert.equal(options.session, session);
    assert.equal(rows[0].previousStock, 4);
    assert.equal(rows[0].newStock, 2);
    assert.equal(rows[0].user, 'actor');
  });
  const result = await store.reduceStock('p1', 2, 'actor', 'manual', 'tenant');
  assert.equal(result.product.newStock, 2);
});

test('insufficient stock fails before writes and ends its session', async (t) => {
  let ended = false;
  t.mock.method(mongoose, 'startSession', async () => ({
    withTransaction: fn => fn(), endSession: async () => { ended = true; }
  }));
  t.mock.method(Product, 'findOne', () => ({ session: async () => ({ stock: 1 }) }));
  const history = t.mock.method(StockHistory, 'create', async () => {});
  await assert.rejects(store.reduceStock('p1', 2, 'actor', 'manual'), { code: 'INSUFFICIENT_STOCK' });
  assert.equal(history.mock.callCount(), 0);
  assert.equal(ended, true);
});

test('manual stock rejects non-numeric and non-finite quantities', async () => {
  for (const quantity of [undefined, null, NaN, Infinity, '2', -1]) {
    await assert.rejects(store.addStock('p1', quantity, 'actor'), /Quantity/);
    await assert.rejects(store.setStock('p1', quantity, 'actor'), /Quantity/);
  }
});
