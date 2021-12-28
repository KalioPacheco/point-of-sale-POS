const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
require('dotenv').config();
const router = require('./routes');
const db = require('./database');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(
  express.urlencoded({ limit: '1mb', extended: true, parameterLimit: 1000 }),
);

app.use(
  session({
    secret: process.env.SECRET_KEY_SESSION,
    resave: true,
    saveUninitialized: true,
    store: MongoStore.create({
      mongoUrl: process.env.DB_CONECTION_DEV,
      stringify: false,
    }),
  }),
);

app.use(passport.initialize());
app.use(passport.session());

router(app);
db();

app.listen(3000, () => {
  console.log('Estoy en el puerto 3000');
});
