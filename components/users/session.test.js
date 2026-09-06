const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough-123';
process.env.REFRESH_TOKEN_PEPPER = process.env.REFRESH_TOKEN_PEPPER || 'test-refresh-pepper-that-is-long-enough-123';
const {
  createRefreshToken,
  refreshTokenHash,
  readCookie,
  setRefreshCookie,
  clearRefreshCookie,
} = require('./session');

test('refresh credentials are opaque, hashed and only written as secure cookie data', () => {
  const token = createRefreshToken();
  assert.match(token, /^[A-Za-z0-9_-]{60,}$/);
  assert.notEqual(refreshTokenHash(token), token);
  assert.equal(refreshTokenHash(token), refreshTokenHash(token));
  assert.notEqual(refreshTokenHash(token), refreshTokenHash(createRefreshToken()));

  const res = {
    cookie(name, value, options) { this.cookieValue = { name, value, options }; return this; },
    clearCookie(name, options) { this.clearValue = { name, options }; return this; }
  };
  setRefreshCookie(res, token);
  assert.equal(res.cookieValue.options.httpOnly, true);
  assert.equal(res.cookieValue.options.path, '/users');
  assert.equal(res.cookieValue.value, token);
  clearRefreshCookie(res);
  assert.equal(res.clearValue.name, res.cookieValue.name);
  assert.equal(res.clearValue.options.maxAge, undefined);
});

test('cookie parsing returns only the requested opaque credential', () => {
  const req = { headers: { cookie: 'theme=dark; pos_refresh=abc%2D123; unrelated=value' } };
  assert.equal(readCookie(req, 'pos_refresh'), 'abc-123');
  assert.equal(readCookie(req, 'missing'), null);
});
