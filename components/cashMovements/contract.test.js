const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('./model');
const controller = require('./controller');
const store = require('./store');
const { validateCashMovement } = require('../../middleware/validation');
const { CASH_MOVEMENT_TYPES } = require('./types');

async function runMiddlewares(middlewares, req) {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  for (const middleware of middlewares) {
    await new Promise((resolve, reject) => {
      let settled = false;

      const next = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      Promise.resolve(middleware(req, res, next))
        .then(() => {
          if (!settled) {
            settled = true;
            resolve();
          }
        })
        .catch(reject);
    });
  }

  return res;
}

test('cash movement model enum stays aligned with canonical types', () => {
  assert.deepEqual(model.schema.path('type').enumValues, CASH_MOVEMENT_TYPES);
});

test('cash movement validation accepts canonical API type and rejects UI alias', async () => {
  const validRes = await runMiddlewares(validateCashMovement, {
    body: {
      type: 'initial_cash',
      amount: 100,
      description: 'Fondo inicial',
    },
  });

  assert.equal(validRes.statusCode, 200);
  assert.equal(validRes.payload, null);

  const invalidRes = await runMiddlewares(validateCashMovement, {
    body: {
      type: 'entrada',
      amount: 100,
      description: 'Fondo inicial',
    },
  });

  assert.equal(invalidRes.statusCode, 400);
  assert.match(invalidRes.payload.error, /Datos inv.lidos/);
});

test('cash movement controller normalizes legacy aliases before persisting', async (t) => {
  const originalCreateMovement = store.createMovement;

  t.after(() => {
    store.createMovement = originalCreateMovement;
  });

  let receivedMovement = null;
  store.createMovement = async (movementData) => {
    receivedMovement = { ...movementData };
    return receivedMovement;
  };

  await controller.createMovement({
    type: 'entrada',
    amount: 150,
    concept: 'Apertura',
    userId: 'user-1',
  });

  assert.equal(receivedMovement.type, 'initial_cash');
});
