const test = require('node:test');
const assert = require('node:assert/strict');

const branchStore = require('./store');
const cashRegisterStore = require('../cashRegisters/store');
const CashRegisterShift = require('../cashRegisterShifts/model');
const { StockTransfer } = require('../inventory/model');

test('una sucursal no se desactiva si deja un turno abierto', async (t) => {
  t.mock.method(CashRegisterShift, 'exists', async () => ({ _id: 'shift-1' }));
  t.mock.method(StockTransfer, 'exists', async () => null);

  await assert.rejects(
    branchStore.assertCanDeactivate('branch-1', 'company-1'),
    { status: 409, message: /turno abierto/ }
  );
});

test('una sucursal no se desactiva con inventario en tránsito', async (t) => {
  t.mock.method(CashRegisterShift, 'exists', async () => null);
  t.mock.method(StockTransfer, 'exists', async () => ({ _id: 'transfer-1' }));

  await assert.rejects(
    branchStore.assertCanDeactivate('branch-1', 'company-1'),
    { status: 409, message: /tránsito/ }
  );
});

test('una caja no se desactiva si su turno sigue abierto', async (t) => {
  t.mock.method(CashRegisterShift, 'exists', async (query) => {
    assert.equal(query.status, 'open');
    assert.equal(query.$or[0].cashRegisterId, 'register-1');
    return { _id: 'shift-1' };
  });

  await assert.rejects(
    cashRegisterStore.assertCanDeactivate({ _id: 'register-1', code: 'CAJA-1', branch: 'branch-1' }, 'company-1'),
    { status: 409, message: /turno abierto/ }
  );
});

test('un usuario no puede enumerar cajas de una sucursal que no tiene asignada', async () => {
  const registers = await cashRegisterStore.list('company-1', {
    role: 'manager',
    branchAssignments: [{ branch: 'branch-allowed', active: true }],
  }, 'branch-other');

  assert.deepEqual(registers, []);
});
