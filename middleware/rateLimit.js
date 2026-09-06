const crypto = require('crypto');
const mongoose = require('mongoose');
const response = require('../network');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_ACCOUNT = 10;
const MAX_ATTEMPTS_PER_IP = 40;

const loginAttemptSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  windowStartedAt: { type: Date, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const LoginAttempt = mongoose.models.LoginAttempts
  || mongoose.model('LoginAttempts', loginAttemptSchema, 'loginAttempts');

const normalizedUserName = (req) => String(req.body?.userName || '')
  .trim()
  .toLocaleLowerCase();

// Hash the tuple so that the rate-limit collection does not become an
// inventory of account names or raw public IP addresses.
const attemptKey = (req, scope = 'ip-account') => crypto
  .createHmac('sha256', process.env.LOGIN_RATE_LIMIT_PEPPER || process.env.JWT_SECRET)
  .update(`${scope}|${req.ip || req.socket?.remoteAddress || 'unknown'}|${normalizedUserName(req)}`)
  .digest('hex');

async function incrementAttempt(key, now) {
  const windowStartedAt = new Date(now.getTime() - WINDOW_MS);
  const expiresAt = new Date(now.getTime() + WINDOW_MS);
  try {
    return await LoginAttempt.findOneAndUpdate(
      { key, windowStartedAt: { $gte: windowStartedAt } },
      {
        $inc: { count: 1 },
        $set: { expiresAt },
        $setOnInsert: { key, windowStartedAt: now },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    // An expired matching key can race the TTL reset/upsert. Retrying the
    // conditional reset keeps the limit correct without weakening it.
    if (error.code !== 11000) throw error;
    const reset = await LoginAttempt.findOneAndUpdate(
      { key, windowStartedAt: { $lt: windowStartedAt } },
      { $set: { count: 1, windowStartedAt: now, expiresAt } },
      { new: true }
    ).lean();
    if (reset) return reset;
    return LoginAttempt.findOneAndUpdate(
      { key, windowStartedAt: { $gte: windowStartedAt } },
      { $inc: { count: 1 }, $set: { expiresAt } },
      { new: true }
    ).lean();
  }
}

async function loginRateLimit(req, res, next) {
  try {
    const now = new Date();
    const [byPair, byAccount, byIp] = await Promise.all([
      incrementAttempt(attemptKey(req, 'ip-account'), now),
      incrementAttempt(attemptKey(req, 'account'), now),
      incrementAttempt(attemptKey(req, 'ip'), now),
    ]);
    if (!byPair || !byAccount || !byIp
      || byPair.count > MAX_ATTEMPTS_PER_ACCOUNT
      || byAccount.count > MAX_ATTEMPTS_PER_ACCOUNT
      || byIp.count > MAX_ATTEMPTS_PER_IP) {
      return response.error(req, res, 'Demasiados intentos. Intenta nuevamente más tarde.', 429);
    }
    return next();
  } catch (error) {
    // Failing open here would turn a transient Mongo error into unrestricted
    // credential guessing. Authentication can retry after the dependency is
    // healthy, while the request receives a non-sensitive error.
    return response.error(req, res, 'Servicio de autenticación no disponible', 503, error);
  }
}

async function clearLoginAttempts(req) {
  // Preserve the IP-wide signal so a successful login cannot reset a brute
  // force campaign against unrelated accounts behind the same address.
  return LoginAttempt.deleteMany({
    key: { $in: [attemptKey(req, 'ip-account'), attemptKey(req, 'account')] }
  });
}

module.exports = {
  loginRateLimit,
  clearLoginAttempts,
  LoginAttempt,
  attemptKey,
};
