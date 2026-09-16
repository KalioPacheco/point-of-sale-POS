const test = require('node:test');
const assert = require('node:assert/strict');
const { leadPayload } = require('./controller');

test('public lead payload keeps only approved fields and normalizes contact details', () => {
  const lead = leadPayload({
    name: '  Ana   Pérez ',
    business: ' Tienda\nCentro ',
    email: ' ANA@EXAMPLE.COM ',
    phone: ' +52 55 1234 5678 ',
    contactPreference: 'whatsapp',
    whatsappConsent: true,
    message: ' Línea uno\r\nLínea dos ',
    source: 'untrusted',
    company: 'should-not-be-stored',
  });

  assert.deepEqual(lead, {
    name: 'Ana Pérez',
    business: 'Tienda Centro',
    email: 'ana@example.com',
    phone: '+52 55 1234 5678',
    contactPreference: 'whatsapp',
    whatsappConsent: true,
    message: 'Línea uno\nLínea dos',
    source: 'point-of-sale-landing',
  });
});
