const { ObjectId } = require('mongodb');

const missing = field => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }] });

async function matrizForCompany(db, companyId, session = null) {
  return db.collection('branches').findOne({ company: companyId, code: 'MATRIZ', active: { $ne: false } }, { session });
}

function openingItems(product) {
  if (product.hasVariants) {
    return (product.variants || [])
      .filter(variant => variant.active !== false)
      .map(variant => ({
        product: product._id,
        variantId: variant._id,
        onHand: Math.max(0, Number(variant.stock || 0)),
        reorderPoint: Math.max(0, Number(product.reorderPoint || 0)),
      }));
  }
  return [{
    product: product._id,
    onHand: Math.max(0, Number(product.stock || 0)),
    reorderPoint: Math.max(0, Number(product.reorderPoint || 0)),
  }];
}

async function expectedByCompany(db, company, session = null) {
  const products = await db.collection('products').find(
    { company: company._id },
    { session, projection: { _id: 1, stock: 1, hasVariants: 1, variants: 1, reorderPoint: 1 } }
  ).toArray();
  return products.flatMap(openingItems);
}

async function inspect(db) {
  const companies = await db.collection('companies').find({}, { projection: { _id: 1 } }).toArray();
  let companiesWithoutMatriz = 0;
  let missingOpeningLevels = 0;
  let openingBalanceMismatch = 0;
  for (const company of companies) {
    const matriz = await matrizForCompany(db, company._id);
    if (!matriz) { companiesWithoutMatriz += 1; continue; }
    const expected = await expectedByCompany(db, company);
    for (const entry of expected) {
      const level = await db.collection('inventoryLevels').findOne({
        company: company._id,
        branch: matriz._id,
        product: entry.product,
        ...(entry.variantId ? { variantId: entry.variantId } : missing('variantId')),
      }, { projection: { onHand: 1 } });
      if (!level) {
        missingOpeningLevels += 1;
      } else if (Number(level.onHand || 0) !== entry.onHand) {
        openingBalanceMismatch += 1;
      }
    }
  }
  return { companiesWithoutMatriz, missingOpeningLevels, openingBalanceMismatch };
}

module.exports = {
  id: '003-inventory-by-branch',
  description: 'Crea saldos de apertura en MATRIZ y deja el flag multiBranchInventory desactivado',
  inspect,
  async up({ db, session }) {
    const companies = await db.collection('companies').find({}, { session, projection: { _id: 1 } }).toArray();
    const result = { companiesProcessed: companies.length, openingLevelsCreated: 0, openingMovementsCreated: 0, flagsPrepared: 0 };
    for (const company of companies) {
      const matriz = await matrizForCompany(db, company._id, session);
      if (!matriz) throw new Error(`MATRIZ branch is required before inventory migration for company ${company._id}`);
      const migrationSourceId = new ObjectId();
      const now = new Date();
      const entries = await expectedByCompany(db, company, session);
      for (const entry of entries) {
        const filter = {
          company: company._id,
          branch: matriz._id,
          product: entry.product,
          ...(entry.variantId ? { variantId: entry.variantId } : missing('variantId')),
        };
        const inserted = await db.collection('inventoryLevels').updateOne(filter, {
          $setOnInsert: {
            ...filter,
            onHand: entry.onHand,
            reserved: 0,
            reorderPoint: entry.reorderPoint,
            version: 0,
            createdAt: now,
            updatedAt: now,
          }
        }, { upsert: true, session });
        if (inserted.upsertedCount === 1) {
          result.openingLevelsCreated += 1;
          await db.collection('inventoryMovements').insertOne({
            company: company._id,
            branch: matriz._id,
            product: entry.product,
            ...(entry.variantId ? { variantId: entry.variantId } : {}),
            type: 'opening_balance',
            quantity: entry.onHand,
            before: 0,
            after: entry.onHand,
            reservedBefore: 0,
            reservedAfter: 0,
            version: 0,
            sourceType: 'inventory_migration',
            sourceId: migrationSourceId,
            idempotencyKey: `003:${company._id}`,
            createdAt: now,
            updatedAt: now,
          }, { session });
          result.openingMovementsCreated += 1;
        }
      }
      await db.collection('companies').updateOne({ _id: company._id }, {
        $set: {
          'featureFlags.multiBranchFoundation': true,
          'featureFlags.multiBranchInventory': false,
          updated: true,
          updatedAt: now,
        }
      }, { session });
      result.flagsPrepared += 1;
    }
    return result;
  },
};
