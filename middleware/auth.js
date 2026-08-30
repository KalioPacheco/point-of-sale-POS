const jwt = require('jsonwebtoken');
const Users = require('../components/users/model');
const response = require('../network');


const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return response.error(req, res, 'Token de acceso requerido', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Users.findById(decoded.userId)
      .select('_id userName name lastNames role typeUser company disable')
      .lean();

    if (!user || user.disable === true) {
      return response.error(req, res, 'Sesion revocada', 401);
    }

    req.user = {
      ...decoded,
      ...user,
      id: user._id,
      userId: user._id,
      role: user.role,
      company: user.company
    };
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return response.error(req, res, 'Token expirado', 401);
    }
    
    return response.error(req, res, 'Token invalido', 403);
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user) {
    return response.error(req, res, 'Usuario no autenticado', 401);
  }

  if (!roles.includes(req.user.role)) {
    return response.error(req, res, 'Acceso denegado por rol insuficiente', 403);
  }

  return next();
};

const requireAdmin = requireRole(['admin', 'administrador']);

const requireManager = requireRole(['admin', 'administrador', 'manager']);

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    req.user = null;
    return next();
  }
};

const requireOwnership = (userIdField = 'userId') => (req, res, next) => {
  if (!req.user) {
    return response.error(req, res, 'Usuario no autenticado', 401);
  }

  const resourceUserId = req.params[userIdField] || req.body[userIdField];
  const currentUserId = req.user.id || req.user.userId;
  const userRole = req.user.role || req.user.userType;
  if (userRole === 'admin' || userRole === 'administrador') {
    return next();
  }

  
  if (resourceUserId && resourceUserId !== currentUserId) {
    return response.error(req, res, 'Solo puedes acceder a tus propios recursos', 403);
  }

  return next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireManager,
  optionalAuth,
  requireOwnership
};
