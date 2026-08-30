const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { randomUUID } = require('node:crypto');
require('dotenv').config();
const router = require('./routes');
const db = require('./database');

const app = express();

app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(
  express.urlencoded({ limit: '1mb', extended: true, parameterLimit: 1000 }),
);


app.use(
  session({
    secret: process.env.SECRET_KEY_SESSION,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 1000
    },
    store: MongoStore.create({
      mongoUrl: process.env.DB_CONECTION_DEV,
      stringify: false,
    }),
  }),
);


app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim());
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, idempotency-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('Referrer-Policy', 'no-referrer');
  next();
});

app.options('*', (req, res) => {
  res.sendStatus(200);
});


router(app);

db();

app.listen(3000, () => {
  console.log('Estoy en el puerto 3000');
});
