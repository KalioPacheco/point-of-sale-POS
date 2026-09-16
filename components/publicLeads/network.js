const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const { validatePublicLead } = require('../../middleware/validation');
const { createPublicLeadOriginGuard } = require('../../middleware/publicLeadAccess');
const { publicLeadRateLimit } = require('../../middleware/publicLeadRateLimit');

const router = express.Router();
const MAX_BODY_BYTES = 12 * 1024;

function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return response.error(req, res, 'Content-Type debe ser application/json', 415);
  }
  return next();
}

function rejectOversizedPayload(req, res, next) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return response.error(req, res, 'La solicitud excede el tamaño permitido.', 413);
  }
  return next();
}

function absorbHoneypot(req, res, next) {
  if (typeof req.body?.website === 'string' && req.body.website.trim()) {
    // Return the same response as a saved lead so simple bots do not learn
    // which field identified them. Nothing is stored and quota is untouched.
    res.setHeader('Cache-Control', 'no-store');
    return response.success(req, res, { accepted: true }, 201);
  }
  return next();
}

router.post(
  '/',
  createPublicLeadOriginGuard(),
  requireJson,
  rejectOversizedPayload,
  absorbHoneypot,
  publicLeadRateLimit,
  validatePublicLead,
  controller.create
);

module.exports = router;
module.exports.MAX_BODY_BYTES = MAX_BODY_BYTES;
module.exports.absorbHoneypot = absorbHoneypot;
module.exports.rejectOversizedPayload = rejectOversizedPayload;
module.exports.requireJson = requireJson;
