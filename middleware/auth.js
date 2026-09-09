const jwt = require('jsonwebtoken');
const Users = require('../components/users/model');
const response = require('../network');

const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRES_IN || '1h';

const normalizeRole = (role = '') => {
  const normalized = `${role}`.trim().toLowerCase();

  if (normalized === 'administrador') {
    return 'admin';
  }

  return normalized;
};

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1];
};

const buildAuthUser = (userDocument, decodedToken = {}) => {
  const user = typeof userDocument?.toObject === 'function'
    ? userDocument.toObject()
    : userDocument;

  if (!user) {
    return null;
  }

  const userId = user._id?.toString?.() || decodedToken.userId || decodedToken.id || '';

  return {
    id: userId,
    userId,
    userName: user.userName || decodedToken.userName || '',
    name: user.name || decodedToken.name || '',
    lastNames: user.lastNames || decodedToken.lastNames || '',
    role: normalizeRole(user.role || ''),
    typeUser: user.typeUser || decodedToken.typeUser || null,
    company: user.company || null,
    branchAssignments: user.branchAssignments || [],
    photo: user.photo || decodedToken.photo || '',
    tokenVersion: user.tokenVersion ?? decodedToken.tokenVersion ?? 0,
    auth: {
      issuedAt: decodedToken.iat || null,
      expiresAt: decodedToken.exp || null,
      expiresIn: ACCESS_TOKEN_TTL,
    },
  };
};

const buildDecodedAuthUser = (decodedToken = {}) => {
  const userId = decodedToken.userId || decodedToken.id || '';

  return {
    id: userId,
    userId,
    userName: decodedToken.userName || '',
    name: decodedToken.name || '',
    lastNames: decodedToken.lastNames || '',
    role: decodedToken.role || '',
    typeUser: decodedToken.typeUser || null,
    company: decodedToken.company || null,
    photo: decodedToken.photo || '',
    tokenVersion: decodedToken.tokenVersion ?? 0,
    auth: {
      issuedAt: decodedToken.iat || null,
      expiresAt: decodedToken.exp || null,
      expiresIn: ACCESS_TOKEN_TTL,
    },
  };
};

const authenticateToken = async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return response.error(req, res, 'Token de acceso requerido', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Users.findById(decoded.userId || decoded.id)
      .select('_id userName name lastNames role typeUser company photo disable tokenVersion branchAssignments')
      .lean();

    if (!user || user.disable === true) {
      return res.status(401).json({
        error: 'Usuario no autorizado',
        message: 'La sesión ya no es vÃ¡lida para este usuario'
      });
    }

    if ((user.tokenVersion ?? 0) !== (decoded.tokenVersion ?? 0)) {
      return res.status(401).json({
        error: 'Sesión invalidada',
        message: 'La sesión fue invalidada. Inicie sesión nuevamente'
      });
    }

    req.user = buildAuthUser(user, decoded);
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        message: 'El token ha expirado, inicie sesión nuevamente'
      });
    }

    return res.status(401).json({
      error: 'Token invÃ¡lido',
      message: 'El token proporcionado no es vÃ¡lido'
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
      error: 'Tenant invÃ¡lido',
      message: 'No se encontró empresa asociada al token'
    });
  }

  return next();
};

const optionalAuth = (req, _res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = buildDecodedAuthUser(decoded);
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
  requireTenant,
  optionalAuth,
  requireOwnership
};
