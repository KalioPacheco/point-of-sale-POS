const express = require('express');
const passport = require('passport');
const { randomUUID } = require('node:crypto');
require('dotenv').config();
const { validateConfig, readiness } = require('./runtime');
const config = validateConfig();
require('./passport');
const router = require('./routes');
const db = require('./database');
const { createHttpAccess } = require('./middleware/httpAccess');

const app = express();

// Configure the exact number of trusted reverse proxies in production. Do
// not trust forwarded headers by default, otherwise a client can choose its
// own rate-limit IP through X-Forwarded-For.
const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(trustedProxyHops) && trustedProxyHops > 0) {
  app.set('trust proxy', trustedProxyHops);
}

app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(createHttpAccess());
app.use(express.json({ limit: '1mb' }));
app.use(
  express.urlencoded({ limit: '1mb', extended: true, parameterLimit: 1000 }),
);

app.use(passport.initialize());

app.options('*', (req, res) => {
  res.sendStatus(200);
});

let stopping = false;
app.get('/health/live', (_req, res) => res.json({ status: 'alive' }));
app.get('/health/ready', readiness(undefined, () => stopping));
app.get('/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: config.version, environment: config.environment });
});
router(app);

async function start() {
  await db();
  const server = app.listen(config.port, () => console.log(`API listening on ${config.port}`));
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(async () => {
      await require('mongoose').disconnect();
      clearTimeout(deadline);
    });
    server.closeIdleConnections?.();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.on('error', () => { console.error('API listener failed'); shutdown(); process.exitCode = 1; });
}
start().catch(async () => {
  console.error('API startup failed: verify database connectivity and configuration');
  await require('mongoose').disconnect();
  process.exitCode = 1;
});
