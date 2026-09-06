const store = require('./store');
const passport = require('passport');
const mongoose = require('mongoose');
const Users = require('./model');
const { clearLoginAttempts } = require('../../middleware/rateLimit');
const Companies = require('../companies/model');
const RefreshToken = require('./refreshToken.model');
const {
  createAccessToken,
  createRefreshToken,
  refreshTokenHash,
  refreshDurationMs,
  setRefreshCookie,
  clearRefreshCookie,
  readCookie,
  requestFingerprint,
} = require('./session');

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

function buildAuthResponse(user, company, refreshSupported = false) {
  const payload = buildAuthPayload(user, company);
  const access = createAccessToken(payload);

  return {
    success: true,
    message: 'Autenticación exitosa',
    token: access.token,
    session: {
      strategy: refreshSupported ? 'jwt-refresh-rotation' : 'jwt',
      refreshSupported,
      expiresIn: access.expiresIn,
      expiresAt: access.expiresAt,
      invalidation: 'logout and refresh-token reuse revoke the current session family',
    },
    user: {
      id: user._id,
      userName: user.userName,
      name: user.name,
      lastNames: user.lastNames,
      typeUser: user.typeUser,
      company: company?._id || user.company || null,
      companyName: company?.name || null,
      photo: user.photo,
      role: user.role
    }
  };
}

async function findActiveCompany(user) {
  if (!user.company) {
    const error = new Error('Usuario sin empresa asignada. Contacta al administrador.');
    error.status = 403;
    error.code = 'COMPANY_REQUIRED';
    throw error;
  }

  const company = await Companies.findById(user.company).select('_id disable name').lean();
  if (!company || company.disable === true) {
    const error = new Error('La empresa asignada a este usuario está deshabilitada. Reasigna una empresa activa.');
    error.status = 403;
    error.code = 'COMPANY_DISABLED';
    throw error;
  }
  return company;
}

async function createRefreshSession({ user, familyId, req, session = null }) {
  const token = createRefreshToken();
  const now = new Date();
  const record = {
    tokenHash: refreshTokenHash(token),
    familyId: familyId || new mongoose.Types.ObjectId().toString(),
    user: user._id,
    expiresAt: new Date(now.getTime() + refreshDurationMs()),
    createdIpHash: requestFingerprint(req),
    createdUserAgent: String(req.get('user-agent') || '').slice(0, 512),
  };
  const created = await RefreshToken.create([record], session ? { session } : undefined);
  return { token, record: created[0] };
}

async function establishSession({ user, company, req, res, familyId, session = null }) {
  const refresh = await createRefreshSession({ user, familyId, req, session });
  setRefreshCookie(res, refresh.token);
  return buildAuthResponse(user, company, true);
}

async function revokeRefreshTokens(userId, reason, familyId = null) {
  const filter = { user: userId, revokedAt: null };
  if (familyId) filter.familyId = familyId;
  await RefreshToken.updateMany(filter, {
    $set: { revokedAt: new Date(), revokedReason: reason }
  });
}

async function rejectRefresh(res, message = 'La sesión ya no es válida') {
  clearRefreshCookie(res);
  return res.status(401).json({
    success: false,
    message,
    code: 'REFRESH_INVALID',
  });
}

/** Rotate an opaque, one-time refresh token and return a new short access JWT. */
async function refresh(req, res) {
  if (!req.trustedOrigin) {
    return res.status(403).json({ success: false, message: 'Origen no autorizado', code: 'ORIGIN_FORBIDDEN' });
  }

  const rawToken = readCookie(req, process.env.REFRESH_COOKIE_NAME || 'pos_refresh');
  if (!rawToken) return rejectRefresh(res);

  const existing = await RefreshToken.findOne({ tokenHash: refreshTokenHash(rawToken) }).lean();
  const now = new Date();
  if (!existing || existing.expiresAt <= now) return rejectRefresh(res);

  if (existing.revokedAt) {
    await revokeRefreshTokens(existing.user, 'refresh_token_reuse', existing.familyId);
    await Users.findByIdAndUpdate(existing.user, { $inc: { tokenVersion: 1 } });
    return rejectRefresh(res, 'La sesión fue invalidada por seguridad');
  }

  const dbSession = await mongoose.startSession();
  let rotated = null;
  let reuseDetected = false;
  try {
    await dbSession.withTransaction(async () => {
      const consumed = await RefreshToken.findOneAndUpdate(
        { _id: existing._id, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, revokedReason: 'rotated', lastUsedAt: now } },
        { new: true, session: dbSession }
      );
      if (!consumed) {
        reuseDetected = true;
        return;
      }

      const user = await Users.findById(consumed.user)
        .select('_id userName name lastNames role typeUser company photo disable tokenVersion')
        .session(dbSession)
        .lean();
      if (!user || user.disable === true) throw Object.assign(new Error('Usuario no autorizado'), { status: 401 });
      const company = await findActiveCompany(user);
      const refreshSession = await createRefreshSession({
        user,
        familyId: consumed.familyId,
        req,
        session: dbSession,
      });
      await RefreshToken.updateOne(
        { _id: consumed._id },
        { $set: { replacedBy: refreshSession.record._id } },
        { session: dbSession }
      );
      rotated = { user, company, token: refreshSession.token };
    });
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      clearRefreshCookie(res);
      return res.status(error.status).json({ success: false, message: error.message, code: 'SESSION_UNAVAILABLE' });
    }
    throw error;
  } finally {
    await dbSession.endSession();
  }

  if (reuseDetected || !rotated) {
    await revokeRefreshTokens(existing.user, 'refresh_token_reuse', existing.familyId);
    await Users.findByIdAndUpdate(existing.user, { $inc: { tokenVersion: 1 } });
    return rejectRefresh(res, 'La sesión fue invalidada por seguridad');
  }

  setRefreshCookie(res, rotated.token);
  return res.status(200).json({
    ...buildAuthResponse(rotated.user, rotated.company, true),
    message: 'Sesión renovada',
  });
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
      const company = await findActiveCompany(user);
      await clearLoginAttempts(req);
      const session = await establishSession({ user, company, req, res });
      return res.status(200).json({
        ...session,
        message: 'Login exitoso',
      });
    } catch (tokenError) {
      if (tokenError.status === 403) {
        return res.status(403).json({ success: false, message: tokenError.message, code: tokenError.code });
      }
      console.error('Error generando JWT:', tokenError);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        code: 'TOKEN_ERROR'
      });
    }
  })(req, res, next);
}

function register(req, res) {
  const { userName, password, name, lastNames, role } = req.body;
  const company = req.user?.company;
  const createdBy = req.user?._id || req.user?.userId || req.user?.id;

  if (!company) {
    return res.status(403).json({
      success: false,
      message: 'Company scope is required',
      code: 'COMPANY_SCOPE_REQUIRED'
    });
  }

  const newUser = new Users({
    userName,
    password,
    name,
    lastNames,
    role,
    company,
    createdBy
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

async function logout(req) {
  const userId = req.user?.id || req.user?.userId;
  await revokeRefreshTokens(userId, 'logout');
  return store.logout(userId);
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
  refresh,
  logout,
  register,
};
