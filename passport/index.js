const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const Usuario = require('../components/users/model');
const response = require('../network');

passport.serializeUser((usuario, done) => {
  // eslint-disable-next-line no-underscore-dangle
  done(null, usuario._id);
});

passport.deserializeUser((id, done) => {
  Usuario.findById(id, (err, user) => {
    done(err, user);
  });
});

passport.use(
  new LocalStrategy(
    { usernameField: 'userName' },
    (userName, password, done) => {
      Usuario.findOne({ userName }, (err, user) => {
        if (!user) {
          done(null, false, { message: 'username is no register' });
        } else {
          Usuario.checkPassword(password, (error, isSame) => {
            if (isSame) {
              done(null, user);
            } else {
              done(null, false, { message: 'Invalid password' });
            }
          });
        }
      });
    },
  ),
);

exports.isAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    next();
  }
  response.error(req, res, 'Login is necessary', 500, 'Login necesario');
};
