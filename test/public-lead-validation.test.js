const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { validatePublicLead } = require('../middleware/validation');

async function validationServer(t) {
  const app = express();
  app.use(express.json());
  app.post('/validate', validatePublicLead, (req, res) => res.status(200).json(req.body));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}/validate`;
}

test('public lead validation rejects unsafe or incomplete contact requests', async t => {
  const endpoint = await validationServer(t);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'A',
      business: 'Negocio',
      email: 'not-an-email',
      contactPreference: 'whatsapp',
      phone: '',
      whatsappConsent: false,
      message: 'x'.repeat(2001),
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('public lead validation accepts consented WhatsApp contact details', async t => {
  const endpoint = await validationServer(t);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Ana Pérez',
      business: 'Tienda Centro',
      email: 'ana@example.com',
      contactPreference: 'whatsapp',
      phone: '+52 55 1234 5678',
      whatsappConsent: true,
      message: 'Quiero una demo.',
      source: 'point-of-sale-landing',
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.contactPreference, 'whatsapp');
  assert.equal(body.whatsappConsent, true);
});
