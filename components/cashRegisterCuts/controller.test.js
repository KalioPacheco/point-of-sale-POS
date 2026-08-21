const test = require('node:test');
const assert = require('node:assert/strict');

const controller = require('./controller');
const store = require('./store');

test('createCashRegisterCut valida campos requeridos', () => {
  assert.throws(
    () => {
      controller.createCashRegisterCut({
        cashierId: 'cashier-1',
        administratorId: 'admin-1',
        shiftStart: '2024-01-01T09:00:00.000Z',
        shiftEnd: '2024-01-01T18:00:00.000Z',
        actualCash: 100,
      });
    },
    /Cash register required/
  );
});

test('createCashRegisterCut rechaza cuando shiftEnd <= shiftStart', () => {
  assert.throws(
    () => {
      controller.createCashRegisterCut({
        cashRegister: 'CAJA-1',
        cashierId: 'cashier-1',
        administratorId: 'admin-1',
        shiftStart: '2024-01-01T18:00:00.000Z',
        shiftEnd: '2024-01-01T09:00:00.000Z',
        actualCash: 100,
      });
    },
    /End time must be after start time/
  );
});

test('createCashRegisterCut delega a store cuando los datos son validos', async (t) => {
  const originalCreate = store.createCashRegisterCut;

  store.createCashRegisterCut = async (payload) => ({
    success: true,
    cut: { cutNumber: 'CUT-1', ...payload },
  });

  t.after(() => {
    store.createCashRegisterCut = originalCreate;
  });

  const payload = {
    cashRegister: 'CAJA-1',
    cashierId: 'cashier-1',
    administratorId: 'admin-1',
    shiftStart: '2024-01-01T09:00:00.000Z',
    shiftEnd: '2024-01-01T18:00:00.000Z',
    actualCash: 1200,
    initialCash: 500,
  };

  const result = await controller.createCashRegisterCut(payload);

  assert.equal(result.success, true);
  assert.equal(result.cut.cashRegister, 'CAJA-1');
  assert.equal(result.cut.actualCash, 1200);
});
