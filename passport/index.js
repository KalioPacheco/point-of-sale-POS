const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const Users = require('../components/users/model');
const { authenticateToken } = require('../middleware/auth');

passport.use(
  new LocalStrategy(
    { usernameField: 'userName' },
    (userName, password, done) => {
      Users.findOne({ userName }, (err, user) => {
        if (err) return done(err);
        if (!user) {
          return done(null, false, { message: 'Usuario no registrado' });
        }

        user.checkPassword(password, (error, isSame) => {
          if (error) return done(error);
          if (!isSame) {
            return done(null, false, { message: 'Contraseña incorrecta' });
          }
          if (user.disable === true) {
            return done(null, false, { message: 'Usuario deshabilitado' });
          }
          return done(null, user);
        });
      });
    }
  )
);

// Compatibilidad temporal: las rutas deben usar directamente authenticateToken.
exports.isAuth = authenticateToken;
