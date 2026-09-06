const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_EXPIRES_IN || '14d';

const durationMs = (value, name) => {
  const match = /^(\d+)\s*([smhdw])$/i.exec(String(value || '').trim());
  if (!match) throw new Error(`${name} must use an integer followed by s, m, h, d or w`);
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[match[2].toLowerCase()];
  return Number(match[1]) * factor;
};

const refreshDurationMs = () => durationMs(REFRESH_TOKEN_TTL, 'JWT_REFRESH_EXPIRES_IN');

const cookieName = () => process.env.REFRESH_COOKIE_NAME || 'pos_refresh';

const cookieSameSite = () => {
  const value = String(process.env.REFRESH_COOKIE_SAME_SITE || 'lax').trim().toLowerCase();
  if (!['lax', 'strict', 'none'].includes(value)) throw new Error('REFRESH_COOKIE_SAME_SITE must be lax, strict or none');
  return value;
};

const cookieSecure = () => String(process.env.REFRESH_COOKIE_SECURE || process.env.NODE_ENV === 'production').toLowerCase() === 'true';

const refreshCookieOptions = () => {
  const sameSite = cookieSameSite();
  const secure = cookieSecure();
  if (sameSite === 'none' && !secure) throw new Error('REFRESH_COOKIE_SAME_SITE=none requires REFRESH_COOKIE_SECURE=true');
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/users',
    maxAge: refreshDurationMs(),
  };
};

const setRefreshCookie = (res, value) => res.cookie(cookieName(), value, refreshCookieOptions());

const clearRefreshCookie = (res) => {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  return res.clearCookie(cookieName(), options);
};

const readCookie = (req, name) => {
  const header = req.headers.cookie;
  if (!header) return null;
  const prefix = `${name}=`;
  for (const part of header.split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) {
      try { return decodeURIComponent(value.slice(prefix.length)); } catch { return null; }
    }
  }
  return null;
};

const createRefreshToken = () => crypto.randomBytes(48).toString('base64url');

const refreshTokenHash = (value) => crypto
  .createHmac('sha256', process.env.REFRESH_TOKEN_PEPPER || process.env.JWT_SECRET)
  .update(value)
  .digest('hex');

const requestFingerprint = (req) => crypto
  .createHash('sha256')
  .update(`${req.ip || ''}|${req.get('user-agent') || ''}`)
  .digest('hex');

const createAccessToken = (payload) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
  const decoded = jwt.decode(token);
  return {
    token,
    expiresIn: ACCESS_TOKEN_TTL,
    expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
  };
};

module.exports = {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  refreshDurationMs,
  refreshCookieOptions,
  setRefreshCookie,
  clearRefreshCookie,
  readCookie,
  createRefreshToken,
  refreshTokenHash,
  requestFingerprint,
  createAccessToken,
};
