const express = require('express');
const passport = require('passport');
require('dotenv').config();
require('./passport');
const router = require('./routes');
const db = require('./database');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(
  express.urlencoded({ limit: '1mb', extended: true, parameterLimit: 1000 }),
);

app.use(passport.initialize());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, idempotency-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
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
