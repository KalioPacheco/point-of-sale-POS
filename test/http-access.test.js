const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createHttpAccess, PUBLIC_POS_ORIGIN } = require('../middleware/httpAccess');

test('CORS rejects malformed configuration and wildcard origins', () => {
  for (const origin of ['*', 'null', 'https://*.vercel.app', 'https://example.com/path',
    'https://user:secret@example.com', 'https://example.com/?token=secret']) {
    assert.throws(() => createHttpAccess(origin), /CORS_ORIGINS/);
  }
});

test('HTTP access permits exact first-party origins without weakening authentication', async t => {
  const app = express();
  app.use((_req, res, next) => { res.vary('Accept-Encoding'); next(); });
  app.use(createHttpAccess(' http://localhost:5173, https://configured.example/ '));
  app.use(express.json());
  app.options('*', (_req, res) => res.sendStatus(200));
  app.all('*', (_req, res) => res.status(401).json({ code: 'AUTHENTICATION_REQUIRED' }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (const path of ['/users/login', '/sales']) {
    await t.test(`preflight authorizes the public POS for ${path} despite legacy env`, async () => {
      const res = await fetch(baseUrl + path, { method: 'OPTIONS', headers: {
        Origin: PUBLIC_POS_ORIGIN, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key'
      } });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), PUBLIC_POS_ORIGIN);
      assert.match(res.headers.get('access-control-allow-headers').toLowerCase(), /idempotency-key/);
      assert.match(res.headers.get('access-control-allow-methods'), /POST/);
    });
  }
  await t.test('preserves configured origins and headers on unauthorized API responses', async () => {
    const res = await fetch(baseUrl + '/sales', { headers: { Origin: 'https://configured.example' } });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://configured.example');
    assert.match(res.headers.get('vary'), /Accept-Encoding/);
    assert.match(res.headers.get('vary'), /Origin/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });
  for (const origin of ['https://evil.vercel.app', `${PUBLIC_POS_ORIGIN}.evil.test`, 'null', undefined]) {
    await t.test(`does not grant CORS permission to ${origin || 'an absent origin'}`, async () => {
      const res = await fetch(baseUrl + '/sales', { method: 'OPTIONS', headers: origin ? { Origin: origin } : {} });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      assert.match(res.headers.get('vary'), /Origin/);
    });
  }
});
