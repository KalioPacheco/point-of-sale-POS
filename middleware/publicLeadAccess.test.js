const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createHttpAccess } = require('./httpAccess');
const {
  PUBLIC_LANDING_ORIGIN,
  createPublicLeadOriginGuard,
} = require('./publicLeadAccess');

test('public lead origin guard permits only the landing and explicit non-production origins', async t => {
  const app = express();
  app.use(createHttpAccess('http://localhost:4321'));
  app.post('/public/leads', createPublicLeadOriginGuard('http://localhost:4321'), (_req, res) => {
    res.status(201).json({ accepted: true });
  });
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const endpoint = `http://127.0.0.1:${server.address().port}/public/leads`;

  for (const origin of [PUBLIC_LANDING_ORIGIN, 'http://localhost:4321']) {
    const res = await fetch(endpoint, { method: 'POST', headers: { Origin: origin } });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  }

  for (const origin of ['https://evil.example', undefined]) {
    const res = await fetch(endpoint, { method: 'POST', headers: origin ? { Origin: origin } : {} });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  }
});
