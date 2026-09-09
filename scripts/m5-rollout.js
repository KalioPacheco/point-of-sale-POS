const mongoose = require('mongoose');
require('dotenv').config();
const { ObjectId } = require('mongodb');
const {
  reconcileInventory,
  reconcileConsolidatedInventory,
  activationBlockers,
  reportDigest,
  signReport,
  rollbackBlockers,
} = require('./m5-rollout-lib');

mongoose.set('strictQuery', true);

const command = process.argv[2] || 'report';
const apply = process.argv.includes('--apply');
const REQUIRED_MIGRATIONS = [
  '002-multi-branch-foundation',
  '003-inventory-by-branch',
  '004-inventory-level-unique-key',
];
const STAGES = new Set(['inventory', 'promotions']);

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function connectionUrl() {
  const value = process.env.MIGRATION_DATABASE_URL || process.env.DB_CONECTION_DEV;
  if (!value || /[<>]/.test(value)) {
    throw new Error('Configure MIGRATION_DATABASE_URL or DB_CONECTION_DEV with real credentials');
  }
  return value;
}

function requiredCompanyId() {
  const value = option('--company');
  if (!value || !ObjectId.isValid(value)) throw new Error('Use --company <Mongo ObjectId>');
  return new ObjectId(value);
}

function requiredStage() {
  const stage = option('--stage') || 'inventory';
  if (!STAGES.has(stage)) throw new Error('Use --stage inventory or --stage promotions');
  return stage;
}

function missing(field) {
  return { $or: [{ [field]: { $exists: false } }, { [field]: null }] };
}

async function reportForCompany(db, company, appliedMigrations) {
  const matrices = await db.collection('branches').find({ company: company._id, code: 'MATRIZ' }, {
    projection: { _id: 1, active: 1 },
  }).toArray();
  const matriz = matrices.length === 1 ? matrices[0] : null;
  const historicalCounts = await Promise.all([
    db.collection('users').countDocuments({ company: company._id, disable: { $ne: true }, $or: [
      { branchAssignments: { $exists: false } }, { branchAssignments: { $size: 0 } },
    ] }),
    db.collection('sales').countDocuments({ company: company._id, ...missing('branch') }),
    db.collection('cashRegisterShifts').countDocuments({ company: company._id, ...missing('branch') }),
    db.collection('cashMovements').countDocuments({ company: company._id, ...missing('branch') }),
    db.collection('cashRegisterCuts').countDocuments({ company: company._id, ...missing('branch') }),
    db.collection('tickets').countDocuments({ company: company._id, ...missing('transactionInfo.branch') }),
  ]);
  const [
    openShifts,
    inTransitTransfers,
    unapprovedCutDifferences,
    activeBranches,
    activeRegisters,
    promotionSales,
    couponAndPromotionSales,
  ] = await Promise.all([
    db.collection('cashRegisterShifts').countDocuments({ company: company._id, status: 'open' }),
    db.collection('stockTransfers').countDocuments({ company: company._id, status: 'in_transit' }),
    db.collection('cashRegisterCuts').countDocuments({
      company: company._id,
      disable: { $ne: true },
      'cashControl.difference': { $ne: 0 },
      'differenceApproval.status': { $ne: 'approved' },
    }),
    db.collection('branches').countDocuments({ company: company._id, active: { $ne: false } }),
    db.collection('cashRegisters').countDocuments({ company: company._id, active: { $ne: false } }),
    db.collection('sales').countDocuments({ company: company._id, promotionDiscount: { $gt: 0 } }),
    db.collection('sales').countDocuments({ company: company._id, promotionDiscount: { $gt: 0 }, couponDiscount: { $gt: 0 } }),
  ]);

  const [products, matrizLevels, allLevels, openingMovements] = matriz ? await Promise.all([
    db.collection('products').find({ company: company._id }, {
      projection: { _id: 1, stock: 1, hasVariants: 1, variants: 1 },
    }).toArray(),
    db.collection('inventoryLevels').find({ company: company._id, branch: matriz._id }, {
      projection: { product: 1, variantId: 1, onHand: 1 },
    }).toArray(),
    db.collection('inventoryLevels').find({ company: company._id }, {
      projection: { product: 1, variantId: 1, onHand: 1 },
    }).toArray(),
    db.collection('inventoryMovements').find({
      company: company._id,
      branch: matriz._id,
      type: 'opening_balance',
      sourceType: 'inventory_migration',
    }, { projection: { product: 1, variantId: 1, quantity: 1, after: 1 } }).toArray(),
  ]) : [[], [], [], []];
  const matrizInventory = reconcileInventory({ products, levels: matrizLevels, openingMovements });
  const consolidatedInventory = reconcileConsolidatedInventory({ products, levels: allLevels });
  const historicalAttribution = historicalCounts.reduce((sum, value) => sum + value, 0);
  const migrationsApplied = REQUIRED_MIGRATIONS.every(id => appliedMigrations.has(id));
  const blockers = activationBlockers({
    migrationsApplied,
    matrizCount: matrices.length,
    historicalAttribution,
    inventory: matrizInventory,
    openShifts,
    inTransitTransfers,
    unapprovedCutDifferences,
  });

  return {
    company: { id: String(company._id), name: company.name || '', featureFlags: company.featureFlags || {} },
    migrationsApplied,
    matriz: { count: matrices.length, id: matriz ? String(matriz._id) : null, active: Boolean(matriz && matriz.active !== false) },
    operational: {
      activeBranches,
      activeRegisters,
      openShifts,
      inTransitTransfers,
      unapprovedCutDifferences,
      promotionSales,
      couponAndPromotionSales,
    },
    historicalAttribution: {
      activeUsersWithoutAssignments: historicalCounts[0],
      salesWithoutBranch: historicalCounts[1],
      shiftsWithoutBranch: historicalCounts[2],
      movementsWithoutBranch: historicalCounts[3],
      cutsWithoutBranch: historicalCounts[4],
      ticketsWithoutBranch: historicalCounts[5],
      total: historicalAttribution,
    },
    inventory: {
      matrizOpening: matrizInventory,
      consolidated: consolidatedInventory,
    },
    activationBlockers: blockers,
    inventoryActivationReady: blockers.length === 0,
    promotionsActivationReady: blockers
      .filter(blocker => blocker !== 'INVENTORY_RECONCILIATION_FAILED').length === 0
      && consolidatedInventory.matches,
  };
}

async function buildReport(db, companyId = null) {
  const companyFilter = companyId ? { _id: companyId, disable: { $ne: true } } : { disable: { $ne: true } };
  const [companies, applied] = await Promise.all([
    db.collection('companies').find(companyFilter, { projection: { name: 1, featureFlags: 1 } }).toArray(),
    db.collection('_migrations').find({ _id: { $in: REQUIRED_MIGRATIONS } }).toArray(),
  ]);
  if (companyId && companies.length !== 1) throw new Error('Empresa piloto no encontrada o desactivada');
  const appliedMigrations = new Set(applied.map(item => item._id));
  const companyReports = await Promise.all(companies.map(company => reportForCompany(db, company, appliedMigrations)));
  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    requiredMigrations: REQUIRED_MIGRATIONS,
    companies: companyReports,
  };
}

function printReport(report) {
  console.log(JSON.stringify(report, null, 2));
}

function assertWriteConfirmation(databaseName, companyId, stage) {
  if (!apply) throw new Error('This operation is dry-run only. Add --apply after reviewing the report.');
  if (process.env.M5_CONFIRM_DB !== databaseName) {
    throw new Error(`Set M5_CONFIRM_DB=${databaseName} to change rollout flags`);
  }
  if (process.env.M5_CONFIRM_COMPANY !== String(companyId)) {
    throw new Error(`Set M5_CONFIRM_COMPANY=${companyId} to confirm the pilot company`);
  }
  if (process.env.M5_CONFIRM_STAGE !== stage) {
    throw new Error(`Set M5_CONFIRM_STAGE=${stage} to confirm the rollout stage`);
  }
  if (!process.env.M5_REPORT_SIGNING_KEY) {
    throw new Error('Set M5_REPORT_SIGNING_KEY to create a signed activation report');
  }
}

async function activate(db, databaseName, companyId, stage) {
  const report = await buildReport(db, companyId);
  const companyReport = report.companies[0];
  const stageBlockers = stage === 'inventory'
    ? companyReport.activationBlockers
    : companyReport.activationBlockers.filter(blocker => blocker !== 'INVENTORY_RECONCILIATION_FAILED');
  if (stage === 'promotions' && !companyReport.inventory.consolidated.matches) {
    stageBlockers.push('INVENTORY_CONSOLIDATED_RECONCILIATION_FAILED');
  }
  const stageReady = stageBlockers.length === 0;
  if (!stageReady) {
    printReport(report);
    throw new Error(`Activation blocked: ${stageBlockers.join(', ')}`);
  }
  if (stage === 'promotions' && !companyReport.company.featureFlags.multiBranchInventory) {
    throw new Error('Activate inventory for the pilot before promotionsV1');
  }
  assertWriteConfirmation(databaseName, companyId, stage);
  const flags = stage === 'inventory'
    ? { 'featureFlags.multiBranchFoundation': true, 'featureFlags.multiBranchInventory': true }
    : { 'featureFlags.promotionsV1': true };
  const signature = signReport(report, process.env.M5_REPORT_SIGNING_KEY);
  const now = new Date();
  await db.collection('companies').updateOne({ _id: companyId, disable: { $ne: true } }, {
    $set: { ...flags, updated: true, updatedAt: now },
  });
  await db.collection('m5RolloutAudits').insertOne({
    company: companyId,
    action: 'activated',
    stage,
    flags,
    executedAt: now,
    database: databaseName,
    reportDigest: reportDigest(report),
    signature,
    report,
  });
  return { action: 'activated', stage, companyId: String(companyId), signature };
}

async function deactivate(db, databaseName, companyId, stage) {
  const lastActivation = await db.collection('m5RolloutAudits').findOne({
    company: companyId,
    action: 'activated',
    stage,
  }, { sort: { executedAt: -1 } });
  const since = lastActivation?.executedAt;
  const [postActivationInventoryMovements, postActivationSales, postActivationTransfers] = since ? await Promise.all([
    db.collection('inventoryMovements').countDocuments({
      company: companyId,
      createdAt: { $gt: since },
      type: { $ne: 'opening_balance' },
    }),
    db.collection('sales').countDocuments({ company: companyId, createdAt: { $gt: since } }),
    db.collection('stockTransfers').countDocuments({ company: companyId, createdAt: { $gt: since } }),
  ]) : [0, 0, 0];
  const blockers = rollbackBlockers({
    stage,
    activation: lastActivation,
    postActivationInventoryMovements,
    postActivationSales,
    postActivationTransfers,
  });
  if (blockers.length > 0) {
    throw new Error(`Rollback blocked: ${blockers.join(', ')}`);
  }
  assertWriteConfirmation(databaseName, companyId, stage);
  const flags = stage === 'inventory'
    ? { 'featureFlags.multiBranchInventory': false }
    : { 'featureFlags.promotionsV1': false };
  const now = new Date();
  const report = await buildReport(db, companyId);
  const signature = signReport(report, process.env.M5_REPORT_SIGNING_KEY);
  await db.collection('companies').updateOne({ _id: companyId, disable: { $ne: true } }, {
    $set: { ...flags, updated: true, updatedAt: now },
  });
  await db.collection('m5RolloutAudits').insertOne({
    company: companyId,
    action: 'deactivated',
    stage,
    flags,
    executedAt: now,
    database: databaseName,
    reportDigest: reportDigest(report),
    signature,
    report,
  });
  return { action: 'deactivated', stage, companyId: String(companyId), signature };
}

async function run() {
  if (!['report', 'activate', 'deactivate'].includes(command)) {
    throw new Error('Use report, activate or deactivate');
  }
  await mongoose.connect(connectionUrl(), { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const databaseName = mongoose.connection.name;
  if (command === 'report') {
    const companyId = option('--company') ? requiredCompanyId() : null;
    printReport(await buildReport(db, companyId));
    return;
  }
  const companyId = requiredCompanyId();
  const stage = requiredStage();
  const result = command === 'activate'
    ? await activate(db, databaseName, companyId, stage)
    : await deactivate(db, databaseName, companyId, stage);
  console.log(JSON.stringify(result, null, 2));
}

run()
  .catch(error => {
    process.exitCode = 1;
    console.error(error.message);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
