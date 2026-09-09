const test = require('node:test');
const assert = require('node:assert/strict');

const Sale = require('./model');
const reportPage = require('./reportPage');

const ids = {
  company: '64b000000000000000000001',
  branchA: '64b000000000000000000002',
  branchB: '64b000000000000000000003',
};

test('el reporte de ventas restringe los datos a la sucursal solicitada', async (t) => {
  t.mock.method(Sale, 'aggregate', async (pipeline) => {
    const match = pipeline[0].$match;
    assert.equal(String(match.company), ids.company);
    assert.equal(String(match.branch), ids.branchA);
    return [{ summary: [], topProducts: [], items: [] }];
  });
  t.mock.method(Sale, 'populate', async (items) => items);

  const result = await reportPage({
    companyId: ids.company,
    branchId: ids.branchA,
    branchIds: [ids.branchA],
    page: 1,
    limit: 25,
  });

  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
});

test('el reporte no devuelve datos cuando la sucursal no pertenece al alcance permitido', async (t) => {
  t.mock.method(Sale, 'aggregate', async (pipeline) => {
    assert.deepEqual(pipeline[0].$match._id, { $in: [] });
    return [{ summary: [], topProducts: [], items: [] }];
  });
  t.mock.method(Sale, 'populate', async (items) => items);

  await reportPage({
    companyId: ids.company,
    branchId: ids.branchB,
    branchIds: [ids.branchA],
    page: 1,
    limit: 25,
  });
});
