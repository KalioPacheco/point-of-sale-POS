const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig, readiness } = require('../runtime');
const { pageOptions, dateRange } = require('../helpers/query');
const Coupon = require('../components/coupons/model');

const config = { PORT: '4321', DB_CONECTION_DEV: 'mongodb://localhost/test', JWT_SECRET: 'x'.repeat(32), CORS_ORIGINS: 'http://localhost:5173' };
test('runtime rejects incomplete configuration without exposing secrets', () => {
  assert.equal(validateConfig(config).port, 4321);
  for (const patch of [{ PORT: '0' }, { PORT: '3.5' }, { DB_CONECTION_DEV: '' }, { JWT_SECRET: 'short' }, { CORS_ORIGINS: '' }, { JWT_EXPIRES_IN: 'nonsense' }]) {
    assert.throws(() => validateConfig({ ...config, ...patch }));
  }
});
test('readiness checks actual ping, disconnection, failure and shutdown', async () => {
  let pinged = 0;
  const connection = { readyState: 1, db: { admin: () => ({ command: async () => { pinged++; } }) } };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await readiness(connection)({}, res); assert.equal(res.code, 200); assert.equal(pinged, 1);
  connection.readyState = 0;
  await readiness(connection)({}, res); assert.equal(res.code, 503);
  connection.readyState = 1;
  connection.db.admin = () => ({ command: async () => { throw new Error('secret database detail'); } });
  await readiness(connection)({}, res); assert.equal(res.code, 503); assert.deepEqual(res.body, { status: 'unavailable' });
  await readiness(connection, () => true)({}, res); assert.equal(res.code, 503);
});
test('pagination and dates reject malformed ranges and preserve UTC boundaries', () => {
  for (const filters of [{ page: 0 }, { limit: 101 }, { limit: -1 }, { page: 'x' }]) assert.throws(() => pageOptions(filters));
  for (const filters of [{ date: '2026-02-30' }, { date: 'no-date' }, { startDate: '2026-09-01', endDate: '2026-08-01' }]) assert.throws(() => dateRange(filters));
  const range = dateRange({ date: '2026-08-31' });
  assert.equal(range.$gte.toISOString(), '2026-08-31T00:00:00.000Z');
  assert.equal(range.$lte.toISOString(), '2026-08-31T23:59:59.999Z');
  assert.equal(dateRange({ startDate: '2026-08-31T00:00:00-06:00' }).$gte.toISOString(), '2026-08-31T06:00:00.000Z');
});
test('coupons reject future starts and inverted ranges; legacy coupons remain eligible', async () => {
  const coupon = new Coupon({ code: 'TEST', name: 'Test', company: '507f1f77bcf86cd799439011', discountType: 'fixed_amount', discountValue: 150,
    expirationDate: new Date(Date.now() + 86400000), validFrom: new Date(Date.now() + 3600000) });
  assert.equal(coupon.isValidForSale({ subtotal: 200 }).valid, false);
  coupon.validFrom = undefined;
  assert.equal(coupon.isValidForSale({ subtotal: 200 }).valid, true);
  coupon.validFrom = new Date(Date.now() + 172800000);
  await assert.rejects(coupon.validate(), /Fecha inicial/);
});
