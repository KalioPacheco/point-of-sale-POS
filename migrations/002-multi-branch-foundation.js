const missing = field => ({
  $or: [{ [field]: { $exists: false } }, { [field]: null }]
});

const activeUsersWithoutAssignments = {
  disable: { $ne: true },
  $or: [
    { branchAssignments: { $exists: false } },
    { branchAssignments: { $size: 0 } },
  ],
};

async function branchlessOperations(db, collection, field = 'branch') {
  return db.collection(collection).countDocuments({ company: { $exists: true, $ne: null }, ...missing(field) });
}

async function inspect(db) {
  const companies = await db.collection('companies').find({}, { projection: { _id: 1 } }).toArray();
  const companyIds = companies.map(company => company._id);
  const [
    matrices,
    usersWithoutAssignments,
    salesWithoutBranch,
    shiftsWithoutBranch,
    movementsWithoutBranch,
    cutsWithoutBranch,
    ticketsWithoutBranch,
    operationsWithoutCompany,
  ] = await Promise.all([
    db.collection('branches').countDocuments({ code: 'MATRIZ' }),
    db.collection('users').countDocuments(activeUsersWithoutAssignments),
    branchlessOperations(db, 'sales'),
    branchlessOperations(db, 'cashRegisterShifts'),
    branchlessOperations(db, 'cashMovements'),
    branchlessOperations(db, 'cashRegisterCuts'),
    db.collection('tickets').countDocuments({ company: { $exists: true, $ne: null }, ...missing('transactionInfo.branch') }),
    Promise.all([
      db.collection('sales').countDocuments(missing('company')),
      db.collection('cashRegisterShifts').countDocuments(missing('company')),
      db.collection('cashMovements').countDocuments(missing('company')),
      db.collection('cashRegisterCuts').countDocuments(missing('company')),
      db.collection('tickets').countDocuments(missing('company')),
    ]).then(values => values.reduce((sum, value) => sum + value, 0)),
  ]);

  const matricesByCompany = await db.collection('branches').distinct('company', { code: 'MATRIZ' });
  return {
    companiesWithoutMatriz: Math.max(0, companyIds.length - matricesByCompany.length),
    matrizCount: matrices,
    activeUsersWithoutBranchAssignments: usersWithoutAssignments,
    salesWithoutBranch,
    shiftsWithoutBranch,
    movementsWithoutBranch,
    cutsWithoutBranch,
    ticketsWithoutBranch,
    operationsWithoutCompany,
  };
}

async function cashRegisterCodes(db, companyId) {
  const specs = [
    ['cashRegisterShifts', 'cashRegister'],
    ['sales', 'cashRegister'],
    ['cashMovements', 'cashRegister'],
    ['cashRegisterCuts', 'cashRegister'],
    ['tickets', 'transactionInfo.cashRegister'],
  ];
  const values = await Promise.all(specs.map(([collection, field]) =>
    db.collection(collection).distinct(field, { company: companyId })));
  const codes = new Set(values.flat()
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim().toUpperCase()));
  if (codes.size === 0) codes.add('CAJA-1');
  return [...codes].sort();
}

async function getOrCreateMatriz(db, companyId, session) {
  const branches = db.collection('branches');
  let branch = await branches.findOne({ company: companyId, code: 'MATRIZ' }, { session });
  if (!branch) {
    const now = new Date();
    const inserted = await branches.insertOne({
      company: companyId,
      code: 'MATRIZ',
      name: 'Matriz',
      address: {},
      active: true,
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    }, { session });
    branch = await branches.findOne({ _id: inserted.insertedId }, { session });
  }
  return branch;
}

async function getOrCreateRegisters(db, companyId, branch, session) {
  const registers = db.collection('cashRegisters');
  const codes = await cashRegisterCodes(db, companyId);
  const byCode = new Map();
  for (const code of codes) {
    let register = await registers.findOne({ company: companyId, code }, { session });
    if (!register) {
      const now = new Date();
      const inserted = await registers.insertOne({
        company: companyId,
        branch: branch._id,
        code,
        name: code === 'CAJA-1' ? 'Caja principal' : code,
        active: true,
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now,
      }, { session });
      register = await registers.findOne({ _id: inserted.insertedId }, { session });
    }
    byCode.set(code, register);
  }
  return byCode;
}

async function attributeByCompany(db, companyId, branch, registers, session) {
  const base = {
    branch: branch._id,
    branchAttribution: 'assumed_default',
  };
  const collections = ['sales', 'cashRegisterShifts', 'cashMovements', 'cashRegisterCuts'];
  const updates = [];
  for (const collection of collections) {
    updates.push(db.collection(collection).updateMany(
      { company: companyId, ...missing('branch') },
      { $set: base },
      { session }
    ));
  }
  updates.push(db.collection('tickets').updateMany(
    { company: companyId, ...missing('transactionInfo.branch') },
    { $set: { 'transactionInfo.branch': branch._id, branchAttribution: 'assumed_default' } },
    { session }
  ));

  for (const [code, register] of registers) {
    for (const collection of collections) {
      updates.push(db.collection(collection).updateMany(
        { company: companyId, cashRegister: code, ...missing('cashRegisterId') },
        { $set: { cashRegisterId: register._id, branch: branch._id, branchAttribution: 'assumed_default' } },
        { session }
      ));
    }
    updates.push(db.collection('tickets').updateMany(
      { company: companyId, 'transactionInfo.cashRegister': code, ...missing('transactionInfo.cashRegisterId') },
      { $set: {
        'transactionInfo.cashRegisterId': register._id,
        'transactionInfo.branch': branch._id,
        branchAttribution: 'assumed_default'
      } },
      { session }
    ));
  }
  await Promise.all(updates);
}

async function assignCurrentUsers(db, companyId, branch, registers, session) {
  const defaultRegister = registers.get('CAJA-1') || registers.values().next().value;
  return db.collection('users').updateMany(
    { company: companyId, ...activeUsersWithoutAssignments },
    { $set: {
      branchAssignments: [{
        branch: branch._id,
        defaultCashRegister: defaultRegister?._id,
        active: true,
        assignedBy: null,
        assignedAt: new Date(),
      }],
      updated: true,
      updatedAt: new Date(),
    } },
    { session }
  );
}

module.exports = {
  id: '002-multi-branch-foundation',
  description: 'Crea Matriz, cajas históricas y atribución de sucursal sin alterar importes ni inventario',
  inspect,
  async up({ db, session }) {
    const companies = await db.collection('companies').find({}, { session, projection: { _id: 1 } }).toArray();
    const result = {
      matricesCreatedOrFound: 0,
      registersCreatedOrFound: 0,
      usersAssigned: 0,
      companiesProcessed: companies.length,
    };
    for (const company of companies) {
      const matriz = await getOrCreateMatriz(db, company._id, session);
      const registers = await getOrCreateRegisters(db, company._id, matriz, session);
      const users = await assignCurrentUsers(db, company._id, matriz, registers, session);
      await attributeByCompany(db, company._id, matriz, registers, session);
      result.matricesCreatedOrFound += 1;
      result.registersCreatedOrFound += registers.size;
      result.usersAssigned += users.modifiedCount;
    }
    return result;
  },
};
