const test = require('node:test');
const assert = require('node:assert/strict');
const { requireTenantParam, scopeResource } = require('../middleware/tenant');

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('tenant param rejects a different company', () => {
  const req = { companyId: 'company-a', params: { companyId: 'company-b' } };
  const res = response();
  let called = false;
  requireTenantParam('companyId')(req, res, () => { called = true; });
  assert.equal(res.statusCode, 404);
  assert.equal(called, false);
});

test('tenant param accepts the authenticated company', () => {
  const req = { companyId: 'company-a', params: { companyId: 'company-a' } };
  const res = response();
  let called = false;
  requireTenantParam('companyId')(req, res, () => { called = true; });
  assert.equal(called, true);
});

test('resource scope always queries by id and authenticated company', async () => {
  let receivedFilter;
  const Model = {
    async findOne(filter) {
      receivedFilter = filter;
      return { _id: '64b000000000000000000001', company: 'company-a' };
    }
  };
  const req = {
    companyId: 'company-a',
    params: { resourceId: '64b000000000000000000001' },
    body: {}
  };
  const res = response();
  let called = false;

  await scopeResource(Model, 'resourceId')(req, res, () => { called = true; });

  assert.deepEqual(receivedFilter, {
    _id: '64b000000000000000000001',
    company: 'company-a'
  });
  assert.equal(called, true);
});
