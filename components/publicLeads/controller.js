const response = require('../../network');
const store = require('./store');

function normalizeSingleLine(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeMessage(value) {
  return String(value || '').trim().replace(/\r\n/g, '\n');
}

function leadPayload(body) {
  const contactPreference = ['email', 'whatsapp', 'call'].includes(body.contactPreference)
    ? body.contactPreference
    : 'email';
  return {
    name: normalizeSingleLine(body.name),
    business: normalizeSingleLine(body.business),
    email: normalizeSingleLine(body.email).toLowerCase(),
    phone: normalizeSingleLine(body.phone),
    contactPreference,
    whatsappConsent: contactPreference === 'whatsapp' && body.whatsappConsent === true,
    message: normalizeMessage(body.message),
    // Do not trust a client-provided source; this router is only for the landing.
    source: 'point-of-sale-landing',
  };
}

async function create(req, res) {
  try {
    await store.add(leadPayload(req.body));
    res.setHeader('Cache-Control', 'no-store');
    return response.success(req, res, { accepted: true }, 201);
  } catch (error) {
    return response.error(req, res, 'No se pudo registrar la solicitud.', 500, error);
  }
}

module.exports = { create, leadPayload };
