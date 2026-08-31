const express = require('express');
const passport = require('passport');
const { randomUUID } = require('node:crypto');
require('dotenv').config();
require('./passport');
const router = require('./routes');
const db = require('./database');
const { createHttpAccess } = require('./middleware/httpAccess');

const app = express();

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

router(app);

db();

app.listen(3000, () => {
  console.log('Estoy en el puerto 3000');
});
