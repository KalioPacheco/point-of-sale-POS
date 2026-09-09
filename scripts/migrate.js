const mongoose = require('mongoose');
require('dotenv').config();
mongoose.set('strictQuery', true);

const migrations = [
  require('../migrations/001-operational-baseline'),
  require('../migrations/002-multi-branch-foundation'),
  require('../migrations/003-inventory-by-branch'),
  require('../migrations/004-inventory-level-unique-key')
];

const command = process.argv[2] || 'status';
const apply = process.argv.includes('--apply');

function connectionUrl() {
  const value = process.env.MIGRATION_DATABASE_URL || process.env.DB_CONECTION_DEV;
  if (!value || /[<>]/.test(value)) {
    throw new Error('Configure MIGRATION_DATABASE_URL or DB_CONECTION_DEV with real credentials');
  }
  return value;
}

function blockerTotal(report) {
  return Object.values(report).reduce((total, value) => total + Number(value || 0), 0);
}

async function status(db) {
  const applied = await db.collection('_migrations').find({}).sort({ _id: 1 }).toArray();
  const appliedIds = new Set(applied.map(item => item._id));
  return migrations.map(migration => ({
    id: migration.id,
    status: appliedIds.has(migration.id) ? 'applied' : 'pending'
  }));
}

async function run() {
  await mongoose.connect(connectionUrl(), { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const databaseName = mongoose.connection.name;

  if (command === 'status') {
    console.table(await status(db));
    return;
  }

  if (!['plan', 'up'].includes(command)) {
    throw new Error('Use status, plan or up');
  }

  const applied = new Set(
    (await db.collection('_migrations').find({}).project({ _id: 1 }).toArray())
      .map(item => item._id)
  );
  const pending = migrations.filter(migration => !applied.has(migration.id));

  if (pending.length === 0) {
    console.log('No pending migrations');
    return;
  }

  console.log(`Database: ${databaseName}`);
  for (const migration of pending) {
    const before = await migration.inspect(db);
    console.log(`\n${migration.id}: ${migration.description}`);
    console.table(before);

    if (command === 'plan' || !apply) continue;
    if (process.env.MIGRATION_CONFIRM_DB !== databaseName) {
      throw new Error(`Set MIGRATION_CONFIRM_DB=${databaseName} to apply this migration`);
    }

    // Index DDL cannot run inside a MongoDB transaction. A migration may
    // provide an idempotent prepare hook for DDL; it runs only after the same
    // explicit database confirmation as the transactional data mutation.
    const preparation = migration.prepare ? await migration.prepare({ db }) : undefined;
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = { ...(await migration.up({ db, session })), ...(preparation || {}) };
        await db.collection('_migrations').insertOne({
          _id: migration.id,
          description: migration.description,
          appliedAt: new Date(),
          result
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    console.log('Applied:', result);
    const after = await migration.inspect(db);
    console.table(after);
    if (blockerTotal(after) > 0) {
      process.exitCode = 2;
      console.error('Migration applied safe changes, but ambiguous records still require manual remediation');
    }
  }
}

run()
  .catch(error => {
    process.exitCode = 1;
    console.error(error.message);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
