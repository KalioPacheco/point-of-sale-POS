const response = require('../network');

const PUBLIC_LANDING_ORIGIN = 'https://pos.automatizalo.dev';

function parseExactOrigins(configuredOrigins = '') {
  const allowedOrigins = new Set([PUBLIC_LANDING_ORIGIN]);
  if (!configuredOrigins) return allowedOrigins;

  for (const entry of configuredOrigins.split(',')) {
    const value = entry.trim();
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error('PUBLIC_LEAD_ORIGINS contains an invalid origin'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.search || url.hash || url.pathname !== '/' || url.hostname.includes('*')) {
      throw new Error('PUBLIC_LEAD_ORIGINS must contain exact HTTP(S) origins without paths or wildcards');
    }
    allowedOrigins.add(url.origin);
  }
  return allowedOrigins;
}

function createPublicLeadOriginGuard(configuredOrigins = process.env.PUBLIC_LEAD_ORIGINS) {
  const allowedOrigins = parseExactOrigins(configuredOrigins);

  return function requirePublicLeadOrigin(req, res, next) {
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) {
      return response.error(req, res, 'Origin not allowed', 403);
    }
    return next();
  };
}

module.exports = {
  PUBLIC_LANDING_ORIGIN,
  createPublicLeadOriginGuard,
  parseExactOrigins,
};
