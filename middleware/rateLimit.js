const attempts = new Map();
const response = require('../network');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const current = attempts.get(key);
  const record = !current || now - current.startedAt > WINDOW_MS
    ? { startedAt: now, count: 0 }
    : current;
  record.count += 1;
  attempts.set(key, record);

  if (record.count > MAX_ATTEMPTS) {
    return response.error(req, res, 'Demasiados intentos. Intenta nuevamente mas tarde.', 429);
  }
  return next();
}

function clearLoginAttempts(req) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  attempts.delete(key);
}

module.exports = { loginRateLimit, clearLoginAttempts };
