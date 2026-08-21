const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const {
  authenticateToken,
  requireRole,
  requireOwnership,
} = require('./auth');

function createMockRes() {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };

  return response;
}

test('authenticateToken rechaza cuando no llega token', () => {
  process.env.JWT_SECRET = 'qa-secret';

  const req = { headers: {} };
  const res = createMockRes();
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error, 'Token de acceso requerido');
});

test('authenticateToken autentica y propaga req.user con token valido', () => {
  process.env.JWT_SECRET = 'qa-secret';

  const Users = require('../components/users/model');
  const originalFindById = Users.findById;

  Users.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: 'user-1',
        userName: 'admin',
        role: 'admin',
        company: 'company-1',
        tokenVersion: 0,
      }),
    }),
  });

  const token = jwt.sign({ userId: 'user-1', role: 'admin', tokenVersion: 0 }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockRes();
  let nextCalled = false;

  return authenticateToken(req, res, () => {
    nextCalled = true;
  }).then(() => {
    Users.findById = originalFindById;

    assert.equal(nextCalled, true);
    assert.equal(req.user.id, 'user-1');
    assert.equal(req.user.userId, 'user-1');
    assert.equal(req.user.role, 'admin');
    assert.equal(req.user.company, 'company-1');
  });
});

test('requireRole bloquea rol insuficiente y permite rol autorizado', () => {
  const middleware = requireRole(['admin']);

  const reqDenied = { user: { id: 'user-2', role: 'vendedor' } };
  const resDenied = createMockRes();
  let deniedNextCalled = false;

  middleware(reqDenied, resDenied, () => {
    deniedNextCalled = true;
  });

  assert.equal(deniedNextCalled, false);
  assert.equal(resDenied.statusCode, 403);
  assert.match(resDenied.payload.error, /Acceso denegado/);

  const reqAllowed = { user: { id: 'user-1', role: 'admin' } };
  const resAllowed = createMockRes();
  let allowedNextCalled = false;

  middleware(reqAllowed, resAllowed, () => {
    allowedNextCalled = true;
  });

  assert.equal(allowedNextCalled, true);
  assert.equal(resAllowed.statusCode, 200);
});

test('requireOwnership rechaza acceso a recursos de otro usuario', () => {
  const middleware = requireOwnership('userId');

  const req = {
    user: { id: 'user-1', role: 'vendedor' },
    params: { userId: 'user-2' },
    body: {},
  };
  const res = createMockRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, 'No autorizado');
});
