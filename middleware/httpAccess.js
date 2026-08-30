const PUBLIC_POS_ORIGIN = 'https://point-of-sale-app-silk.vercel.app';

function createHttpAccess(configuredOrigins = process.env.CORS_ORIGINS) {
  // This first-party deployment stays authorized alongside legacy configured origins.
  const allowedOrigins = new Set([PUBLIC_POS_ORIGIN]);
  const entries = (configuredOrigins || 'http://localhost:5173').split(',');
  for (const entry of entries) {
    const value = entry.trim();
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error('CORS_ORIGINS contains an invalid origin'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' || url.hostname.includes('*')) {
      throw new Error('CORS_ORIGINS must contain exact HTTP(S) origins without paths or wildcards');
    }
    allowedOrigins.add(url.origin);
  }

  return function httpAccess(req, res, next) {
    // Vary even on denied/no-origin responses so caches cannot mix CORS decisions.
    res.vary('Origin');
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key, X-Request-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  };
}

module.exports = { createHttpAccess, PUBLIC_POS_ORIGIN };
