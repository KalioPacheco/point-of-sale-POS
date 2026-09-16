const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough-123';
const { publicLeadAttemptKey } = require('./publicLeadRateLimit');

test('public lead rate-limit keys do not expose visitor IP addresses', () => {
  const request = { ip: '203.0.113.8', socket: { remoteAddress: '203.0.113.8' } };
  const key = publicLeadAttemptKey(request);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key.includes('203.0.113.8'), false);
  assert.equal(key, publicLeadAttemptKey(request));
  assert.notEqual(key, publicLeadAttemptKey({ ...request, ip: '203.0.113.9' }));
});
