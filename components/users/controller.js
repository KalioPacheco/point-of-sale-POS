const store = require('./store');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const Users = require('./model');
const Companies = require('../companies/model');

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
          message: 'La empresa asignada a este usuario está deshabilitada. Reasigna una empresa activa.',
          code: 'COMPANY_DISABLED'
        });
      }

      const payload = {
        userId: user._id,
        userName: user.userName,
        typeUser: user.typeUser,  
        company: company._id,
        role: user.role  
      };
      
      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Login exitoso',
        token: token,
        user: {
          id: user._id,
          userName: user.userName,
          name: user.name,
          lastNames: user.lastNames,
          typeUser: user.typeUser,
          company: company._id,
          photo: user.photo,
          role: user.role
        }
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
      const payload = {
        userId: createdUser._id,
        userName: createdUser.userName,
        typeUser: createdUser.typeUser,
        company: createdUser.company,
        role: createdUser.role
      };
      
      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        token: token,
        user: {
          id: createdUser._id,
          userName: createdUser.userName,
          name: createdUser.name,
          lastNames: createdUser.lastNames,
          typeUser: createdUser.typeUser,
          company: createdUser.company,
          role: createdUser.role
        }
      });
    })
    .catch(error => {
      console.error('Error al crear usuario:', error);
      
      // Manejo específico para errores de unicidad
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
  return store.logout(req);
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