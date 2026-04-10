const store = require('./store');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const Users = require('./model');
const Companies = require('../companies/model');

const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_EXPIRES_IN || '8h';

function buildAuthPayload(user, company) {
  return {
    userId: user._id,
    userName: user.userName,
    typeUser: user.typeUser,
    company: company?._id || user.company || null,
    role: user.role,
    tokenVersion: user.tokenVersion || 0,
  };
}

function buildAuthResponse(user, company) {
  const payload = buildAuthPayload(user, company);
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
  const decoded = jwt.decode(token);

  return {
    success: true,
    message: 'Autenticación exitosa',
    token,
    session: {
      strategy: 'jwt',
      refreshSupported: false,
      expiresIn: ACCESS_TOKEN_TTL,
      expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
      invalidation: 'logout increments tokenVersion and expires current access token',
    },
    user: {
      id: user._id,
      userName: user.userName,
      name: user.name,
      lastNames: user.lastNames,
      typeUser: user.typeUser,
      company: company?._id || user.company || null,
      photo: user.photo,
      role: user.role
    }
  };
}

function addUser(user) {
  if (!user) {
    return Promise.reject(`User data is empty. User: ${JSON.stringify(user)}`);
  }

  return store.add(user);
}

function login(req, res, next) {
  passport.authenticate('local', { session: false }, async (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info.message || 'Autenticación fallida',
        code: 'AUTH_FAILED'
      });
    }

    try {
      if (!user.company) {
        return res.status(403).json({
          success: false,
          message: 'Usuario sin empresa asignada. Contacta al administrador.',
          code: 'COMPANY_REQUIRED'
        });
      }

      const company = await Companies.findById(user.company).select('_id disable name').lean();
      if (!company || company.disable === true) {
        return res.status(403).json({
          success: false,
          message: 'La empresa asignada a este usuario estÃ¡ deshabilitada. Reasigna una empresa activa.',
          code: 'COMPANY_DISABLED'
        });
      }

      return res.status(200).json({
        ...buildAuthResponse(user, company),
        message: 'Login exitoso',
      });
    } catch (tokenError) {
      console.error('Error generando JWT:', tokenError);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        code: 'TOKEN_ERROR'
      });
    }
  })(req, res, next);
}

function register(req, res, next) {
  const { userName, password, name, lastNames, role } = req.body;

  const newUser = new Users({
    userName,
    password,
    name,
    lastNames,
    role
  });

  newUser.save()
    .then(createdUser => {
      return res.status(201).json({
        ...buildAuthResponse(createdUser),
        message: 'Usuario registrado exitosamente',
      });
    })
    .catch(error => {
      console.error('Error al crear usuario:', error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'El nombre de usuario ya existe',
          code: 'DUPLICATE_USER'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        code: 'INTERNAL_ERROR',
        details: error.message
      });
    });
}

function logout(req) {
  return store.logout(req.user?.id || req.user?.userId);
}

function listUsers(userId, companyId) {
  return store.list(userId, companyId);
}

function updateUser(userId, user, companyId) {
  if (!userId || !user) {
    return Promise.reject(
      `userId or user is undefined. userId is: ${userId}, user is: ${JSON.stringify(
        user,
      )}`,
    );
  }
  return store.update(userId, user, companyId);
}

function removeUser(userId, companyId) {
  if (!userId) {
    return Promise.reject('userId is undefined');
  }
  return store.remove(userId, companyId);
}

module.exports = {
  addUser,
  listUsers,
  updateUser,
  removeUser,
  login,
  logout,
  register,
};
