const missing = field => ({
  $or: [
    { [field]: { $exists: false } },
    { [field]: null }
  ]
});

async function countOperationalBlockers(db) {
  const [
    usersWithoutCompany,
    usersWithInvalidRole,
    salesWithoutCompany,
    salesWithoutCashier,
    salesWithoutShift,
    salesWithoutPayment,
    shiftsWithoutCompany,
    shiftsWithoutCashier,
    ticketsWithoutCompany,
    movementsWithoutCompany,
    cutsWithoutCompany
  ] = await Promise.all([
    db.collection('users').countDocuments(missing('company')),
    db.collection('users').countDocuments({ role: { $nin: ['vendedor', 'manager', 'admin'] } }),
    db.collection('sales').countDocuments(missing('company')),
    db.collection('sales').countDocuments(missing('createdBy')),
    db.collection('sales').countDocuments(missing('shift')),
    db.collection('sales').countDocuments(missing('payment.method')),
    db.collection('cashRegisterShifts').countDocuments(missing('company')),
    db.collection('cashRegisterShifts').countDocuments(missing('cashier')),
    db.collection('tickets').countDocuments(missing('company')),
    db.collection('cashMovements').countDocuments(missing('company')),
    db.collection('cashRegisterCuts').countDocuments(missing('company'))
  ]);

  return {
    usersWithoutCompany,
    usersWithInvalidRole,
    salesWithoutCompany,
    salesWithoutCashier,
    salesWithoutShift,
    salesWithoutPayment,
    shiftsWithoutCompany,
    shiftsWithoutCashier,
    ticketsWithoutCompany,
    movementsWithoutCompany,
    cutsWithoutCompany
  };
}

async function deriveCompanyFromReference({
  db,
  targetCollection,
  referenceField,
  sourceCollection,
  session
}) {
  const rows = await db.collection(targetCollection).aggregate([
    { $match: missing('company') },
    { $match: { [referenceField]: { $exists: true, $ne: null } } },
    {
      $lookup: {
        from: sourceCollection,
        localField: referenceField,
        foreignField: '_id',
        as: 'source'
      }
    },
    { $match: { 'source.0.company': { $exists: true, $ne: null } } },
    { $project: { company: { $arrayElemAt: ['$source.company', 0] } } }
  ], { session }).toArray();

  if (rows.length === 0) return 0;
  const result = await db.collection(targetCollection).bulkWrite(
    rows.map(row => ({
      updateOne: {
        filter: { _id: row._id, ...missing('company') },
        update: { $set: { company: row.company } }
      }
    })),
    { ordered: false, session }
  );
  return result.modifiedCount;
}

module.exports = {
  id: '001-operational-baseline',
  description: 'Normaliza RBAC y completa solo contexto operativo derivable sin ambiguedad',

  inspect: countOperationalBlockers,

  async up({ db, session }) {
    const users = await db.collection('users').updateMany(
      { role: 'administrador' },
      { $set: { role: 'admin' } },
      { session }
    );

    const openShifts = await db.collection('cashRegisterShifts').updateMany(
      { ...missing('cutStatus'), status: 'open' },
      { $set: { cutStatus: 'not_required' } },
      { session }
    );
    const completedShifts = await db.collection('cashRegisterShifts').updateMany(
      { ...missing('cutStatus'), status: 'closed', cut: { $exists: true, $ne: null } },
      { $set: { cutStatus: 'completed' } },
      { session }
    );
    const pendingShifts = await db.collection('cashRegisterShifts').updateMany(
      {
        $and: [
          missing('cutStatus'),
          { status: 'closed' },
          { $or: [{ cut: { $exists: false } }, { cut: null }] }
        ]
      },
      { $set: { cutStatus: 'pending' } },
      { session }
    );

    const ticketsFromSales = await deriveCompanyFromReference({
      db,
      targetCollection: 'tickets',
      referenceField: 'saleId',
      sourceCollection: 'sales',
      session
    });
    const ticketsFromCuts = await deriveCompanyFromReference({
      db,
      targetCollection: 'tickets',
      referenceField: 'cutId',
      sourceCollection: 'cashRegisterCuts',
      session
    });
    const movements = await deriveCompanyFromReference({
      db,
      targetCollection: 'cashMovements',
      referenceField: 'saleReference',
      sourceCollection: 'sales',
      session
    });
    const cuts = await deriveCompanyFromReference({
      db,
      targetCollection: 'cashRegisterCuts',
      referenceField: 'shift',
      sourceCollection: 'cashRegisterShifts',
      session
    });

    return {
      normalizedAdminRoles: users.modifiedCount,
      shiftsInitialized: openShifts.modifiedCount + completedShifts.modifiedCount + pendingShifts.modifiedCount,
      ticketsBackfilled: ticketsFromSales + ticketsFromCuts,
      movementsBackfilled: movements,
      cutsBackfilled: cuts
    };
  }
};
