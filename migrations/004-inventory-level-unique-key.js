const INDEX_NAME = 'inventory_level_unique_position_v2';
const INDEX_KEY = { company: 1, branch: 1, product: 1, variantId: 1 };

function sameKey(index) {
  return Object.keys(INDEX_KEY).every(key => index.key?.[key] === INDEX_KEY[key])
    && Object.keys(index.key || {}).length === Object.keys(INDEX_KEY).length;
}

async function inspect(db) {
  let indexes;
  try {
    indexes = await db.collection('inventoryLevels').listIndexes().toArray();
  } catch (error) {
    if (error.code === 26) return { canonicalInventoryLevelUniqueIndexMissing: 1 };
    throw error;
  }
  const index = indexes.find(item => item.name === INDEX_NAME);
  const ready = Boolean(index && index.unique === true && sameKey(index) && !index.partialFilterExpression);
  return { canonicalInventoryLevelUniqueIndexMissing: ready ? 0 : 1 };
}

module.exports = {
  id: '004-inventory-level-unique-key',
  description: 'Crea el índice único válido de posición de inventario para padre y variante',
  inspect,
  // MongoDB does not permit createIndex inside a multi-document transaction.
  // The migration runner invokes this idempotent DDL step only after the
  // explicit database confirmation, then records the migration transactionally.
  async prepare({ db }) {
    await db.collection('inventoryLevels').createIndex(INDEX_KEY, {
      name: INDEX_NAME,
      unique: true,
    });
    return { canonicalInventoryLevelUniqueIndex: INDEX_NAME };
  },
  async up() {
    return { canonicalInventoryLevelUniqueIndex: INDEX_NAME };
  },
};
