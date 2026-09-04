const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createHttpAccess } = require('./middleware/httpAccess');

function validateConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.DB_CONECTION_DEV || '') || /[<>]/.test(env.DB_CONECTION_DEV)) throw new Error('DB_CONECTION_DEV must be an explicit MongoDB URI without placeholders');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || /replace-with/i.test(env.JWT_SECRET)) throw new Error('JWT_SECRET must contain at least 32 non-placeholder characters');
  try { jwt.sign({}, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN || env.JWT_ACCESS_EXPIRES_IN || '1h' }); }
  catch { throw new Error('JWT_EXPIRES_IN is invalid'); }
  if (!env.CORS_ORIGINS?.trim()) throw new Error('CORS_ORIGINS is required');
  createHttpAccess(env.CORS_ORIGINS);
  return { port, version: env.APP_VERSION || 'unknown', environment: env.APP_ENV || env.NODE_ENV || 'development' };
}

function readiness(connection = mongoose.connection, isStopping = () => false) {
  return async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let timer;
    try {
      if (isStopping() || connection.readyState !== 1) throw new Error('Unavailable');
      await Promise.race([
        connection.db.admin().command({ ping: 1 }, { maxTimeMS: 1000 }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout')), 1500); })
      ]);
      if (isStopping()) throw new Error('Stopping');
      res.status(200).json({ status: 'ready' });
    } catch { res.status(503).json({ status: 'unavailable' }); }
    finally { clearTimeout(timer); }
  };
}
module.exports = { validateConfig, readiness };
