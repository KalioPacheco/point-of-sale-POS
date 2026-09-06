const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough-123';
const { attemptKey } = require('./rateLimit');

test('login-rate-limit keys do not expose the IP or account and keep scopes isolated', () => {
  const request = {
    ip: '203.0.113.8',
    body: { userName: 'Cajero' },
    socket: { remoteAddress: '203.0.113.8' }
  };
  const account = attemptKey(request, 'account');
  assert.match(account, /^[a-f0-9]{64}$/);
  assert.equal(account.includes('Cajero'), false);
  assert.equal(account.includes('203.0.113.8'), false);
  assert.equal(account, attemptKey({ ...request, body: { userName: 'cajero' } }, 'account'));
  assert.notEqual(account, attemptKey(request, 'ip'));
  assert.notEqual(account, attemptKey({ ...request, ip: '203.0.113.9' }, 'account'));
});
