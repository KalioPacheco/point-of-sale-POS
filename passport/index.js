const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const Usuario = require('../components/users/model');
const response = require('../network');

passport.serializeUser((usuario, done) => {
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
          return done(null, false, { message: 'username is no register' });
        }
        Usuario.checkPassword(password, (err, isSame) => {
          if (isSame) {
            return done(null, user);
          }
          return done(null, false, { message: 'Invalid password' });
        });
      });
    },
  ),
);

exports.isAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  response.error(req, res, 'Login is necessary', 500, 'Login necesario');
};
