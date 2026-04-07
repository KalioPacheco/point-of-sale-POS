const jwt = require('jsonwebtoken');

const normalizeRole = (role = '') => {
  const normalized = `${role}`.trim().toLowerCase();

  if (normalized === 'administrador') {
    return 'admin';
  }

  return normalized;
};


const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ 
      error: 'Token de acceso requerido',
      message: 'Debe proporcionar un token válido'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expirado',
        message: 'El token ha expirado, inicie sesión nuevamente'
      });
    }
    
    return res.status(403).json({ 
      error: 'Token inválido',
      message: 'El token proporcionado no es válido'
    });
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Usuario no autenticado',
      message: 'Debe estar autenticado para acceder a este recurso'
    });
  }

  const allowedRoles = roles.map(normalizeRole);
  const currentRole = normalizeRole(req.user.role || req.user.userType);

  if (!allowedRoles.includes(currentRole)) {
    return res.status(403).json({
      error: 'Acceso denegado por rol insuficiente'
    });
  }

  return next();
};

const requireAdmin = requireRole(['admin', 'administrador']);

const requireManager = requireRole(['admin', 'administrador', 'manager']);

const requireTenant = (req, res, next) => {
  const companyId = req.user && req.user.company
    ? (typeof req.user.company === 'string' ? req.user.company : req.user.company.toString?.())
    : null;

  if (!companyId) {
    return res.status(403).json({
      error: 'Tenant inválido',
      message: 'No se encontró empresa asociada al token'
    });
  }

  return next();
};

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
    return res.status(401).json({ 
      error: 'Usuario no autenticado' 
    });
  }

  const resourceUserId = req.params[userIdField] || req.body[userIdField];
  const currentUserId = req.user.id || req.user.userId;
  const userRole = req.user.role || req.user.userType;
  if (userRole === 'admin' || userRole === 'administrador') {
    return next();
  }

  
  if (resourceUserId && resourceUserId !== currentUserId) {
    return res.status(403).json({ 
      error: 'No autorizado',
      message: 'Solo puedes acceder a tus propios recursos'
    });
  }

  return next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireManager,
  requireTenant,
  optionalAuth,
  requireOwnership
};