const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const Users = require('../components/users/model');
const response = require('../network');

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET
};

// Estrategia Local para login
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
          return done(null, user);
        });
      });
    }
  )
);

// proteger rutas
passport.use(
  new JwtStrategy(jwtOptions, (jwtPayload, done) => {
    Users.findById(jwtPayload.userId, (err, user) => {
      if (err) return done(err, false);
      if (user) {
        return done(null, user);
      } else {
        return done(null, false);
      }
    });
  })
);


// Middleware 
exports.isAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return response.error(req, res, 'Token inválido o expirado', 401, 'Autenticación requerida');
    }
    req.user = user;
    next();
  })(req, res, next);
};