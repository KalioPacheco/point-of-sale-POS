const crypto = require('crypto');
const mongoose = require('mongoose');
const response = require('../network');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 5;

const publicLeadAttemptSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  windowStartedAt: { type: Date, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

publicLeadAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const PublicLeadAttempt = mongoose.models.PublicLeadAttempts
  || mongoose.model('PublicLeadAttempts', publicLeadAttemptSchema, 'publicLeadAttempts');

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// The TTL collection deliberately keeps only an HMAC. It cannot be used as an
// inventory of visitor IP addresses if the database is inspected later.
function publicLeadAttemptKey(req) {
  const pepper = process.env.PUBLIC_LEAD_RATE_LIMIT_PEPPER
    || process.env.REFRESH_TOKEN_PEPPER
    || process.env.JWT_SECRET;
  return crypto
    .createHmac('sha256', pepper)
    .update(`public-lead|${clientIp(req)}`)
    .digest('hex');
}

async function incrementAttempt(key, now) {
  const windowStartedAt = new Date(now.getTime() - WINDOW_MS);
  const expiresAt = new Date(now.getTime() + WINDOW_MS);
  try {
    return await PublicLeadAttempt.findOneAndUpdate(
      { key, windowStartedAt: { $gte: windowStartedAt } },
      {
        $inc: { count: 1 },
        $set: { expiresAt },
        $setOnInsert: { key, windowStartedAt: now },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    // TTL deletion and an upsert can race. The retry preserves the bound
    // instead of treating that transient database condition as unlimited use.
    if (error.code !== 11000) throw error;
    const reset = await PublicLeadAttempt.findOneAndUpdate(
      { key, windowStartedAt: { $lt: windowStartedAt } },
      { $set: { count: 1, windowStartedAt: now, expiresAt } },
      { new: true }
    ).lean();
    if (reset) return reset;
    return PublicLeadAttempt.findOneAndUpdate(
      { key, windowStartedAt: { $gte: windowStartedAt } },
      { $inc: { count: 1 }, $set: { expiresAt } },
      { new: true }
    ).lean();
  }
}

async function publicLeadRateLimit(req, res, next) {
  try {
    const attempt = await incrementAttempt(publicLeadAttemptKey(req), new Date());
    if (!attempt || attempt.count > MAX_ATTEMPTS_PER_IP) {
      return response.error(req, res, 'Demasiadas solicitudes. Intenta nuevamente más tarde.', 429);
    }
    return next();
  } catch (error) {
    // A fail-open path would make a Mongo outage an unrestricted spam window.
    return response.error(req, res, 'El formulario no está disponible temporalmente.', 503, error);
  }
}

module.exports = {
  MAX_ATTEMPTS_PER_IP,
  PublicLeadAttempt,
  publicLeadAttemptKey,
  publicLeadRateLimit,
};
