const crypto = require('node:crypto');

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positionKey(productId, variantId = null) {
  return `${String(productId)}:${variantId ? String(variantId) : ''}`;
}

/**
 * Mirrors the opening-balance scope of migration 003. It intentionally does
 * not exclude inactive products: migration 003 preserves every product's
 * legacy balance and only skips inactive variants.
 */
function legacyPositions(products) {
  return (products || []).flatMap(product => {
    if (product.hasVariants) {
      return (product.variants || [])
        .filter(variant => variant.active !== false)
        .map(variant => ({
          key: positionKey(product._id, variant._id),
          product: String(product._id),
          variantId: String(variant._id),
          onHand: Math.max(0, number(variant.stock)),
        }));
    }
    return [{
      key: positionKey(product._id),
      product: String(product._id),
      variantId: null,
      onHand: Math.max(0, number(product.stock)),
    }];
  });
}

function reconcileInventory({ products, levels, openingMovements }) {
  const expected = legacyPositions(products);
  const expectedByKey = new Map(expected.map(position => [position.key, position]));
  const levelsByKey = new Map((levels || []).map(level => [
    positionKey(level.product, level.variantId), level,
  ]));
  const movementsByKey = new Map((openingMovements || []).map(movement => [
    positionKey(movement.product, movement.variantId), movement,
  ]));

  const missingLevels = [];
  const balanceMismatches = [];
  const missingOpeningMovements = [];
  for (const position of expected) {
    const level = levelsByKey.get(position.key);
    if (!level) {
      missingLevels.push(position.key);
      continue;
    }
    if (number(level.onHand) !== position.onHand) {
      balanceMismatches.push({
        key: position.key,
        legacyOnHand: position.onHand,
        branchOnHand: number(level.onHand),
      });
    }
    const movement = movementsByKey.get(position.key);
    if (!movement || number(movement.after) !== position.onHand || number(movement.quantity) !== position.onHand) {
      missingOpeningMovements.push(position.key);
    }
  }

  const unexpectedLevels = [...levelsByKey.keys()]
    .filter(key => !expectedByKey.has(key));
  const unexpectedOpeningMovements = [...movementsByKey.keys()]
    .filter(key => !expectedByKey.has(key));

  return {
    expectedPositions: expected.length,
    inventoryLevelCount: levelsByKey.size,
    openingMovementCount: movementsByKey.size,
    missingLevels,
    unexpectedLevels,
    balanceMismatches,
    missingOpeningMovements,
    unexpectedOpeningMovements,
    matches: missingLevels.length === 0
      && unexpectedLevels.length === 0
      && balanceMismatches.length === 0
      && missingOpeningMovements.length === 0
      && unexpectedOpeningMovements.length === 0,
  };
}

/**
 * Once a pilot has more than one branch, legacy stock remains the opening
 * reference. Its comparison target is the sum of every branch, not MATRIZ.
 */
function reconcileConsolidatedInventory({ products, levels }) {
  const expected = legacyPositions(products);
  const expectedByKey = new Map(expected.map(position => [position.key, position]));
  const actualByKey = new Map();
  for (const level of levels || []) {
    const key = positionKey(level.product, level.variantId);
    actualByKey.set(key, number(actualByKey.get(key)) + number(level.onHand));
  }
  const missingPositions = [];
  const balanceMismatches = [];
  for (const position of expected) {
    if (!actualByKey.has(position.key)) {
      missingPositions.push(position.key);
      continue;
    }
    const branchOnHand = number(actualByKey.get(position.key));
    if (branchOnHand !== position.onHand) {
      balanceMismatches.push({ key: position.key, legacyOnHand: position.onHand, branchOnHand });
    }
  }
  const unexpectedPositions = [...actualByKey.keys()].filter(key => !expectedByKey.has(key));
  return {
    expectedPositions: expected.length,
    branchPositions: actualByKey.size,
    missingPositions,
    unexpectedPositions,
    balanceMismatches,
    matches: missingPositions.length === 0
      && unexpectedPositions.length === 0
      && balanceMismatches.length === 0,
  };
}

function activationBlockers({ migrationsApplied, matrizCount, historicalAttribution, inventory, openShifts, inTransitTransfers, unapprovedCutDifferences }) {
  const blockers = [];
  if (!migrationsApplied) blockers.push('MIGRATIONS_002_003_PENDING');
  if (matrizCount !== 1) blockers.push('MATRIZ_MISSING_OR_AMBIGUOUS');
  if (historicalAttribution > 0) blockers.push('HISTORICAL_BRANCH_ATTRIBUTION_PENDING');
  if (!inventory.matches) blockers.push('INVENTORY_RECONCILIATION_FAILED');
  if (openShifts > 0) blockers.push('OPEN_SHIFTS_MUST_BE_CLOSED');
  if (inTransitTransfers > 0) blockers.push('TRANSFERS_IN_TRANSIT');
  if (unapprovedCutDifferences > 0) blockers.push('UNAPPROVED_CUT_DIFFERENCES');
  return blockers;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function reportDigest(report) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(stableValue(report)))
    .digest('hex');
}

function signReport(report, signingKey) {
  const digest = reportDigest(report);
  if (!signingKey) {
    return { algorithm: 'SHA-256', digest, signed: false };
  }
  return {
    algorithm: 'HMAC-SHA-256',
    digest: crypto.createHmac('sha256', signingKey).update(digest).digest('hex'),
    reportDigest: digest,
    signed: true,
  };
}

function rollbackBlockers({ stage, activation, postActivationInventoryMovements, postActivationSales, postActivationTransfers }) {
  if (stage !== 'inventory') return [];
  const blockers = [];
  if (!activation) blockers.push('NO_INVENTORY_ACTIVATION_AUDIT');
  if (postActivationInventoryMovements > 0) blockers.push('POST_ACTIVATION_INVENTORY_MOVEMENTS');
  if (postActivationSales > 0) blockers.push('POST_ACTIVATION_SALES');
  if (postActivationTransfers > 0) blockers.push('POST_ACTIVATION_TRANSFERS');
  return blockers;
}

module.exports = {
  legacyPositions,
  reconcileInventory,
  reconcileConsolidatedInventory,
  activationBlockers,
  reportDigest,
  signReport,
  rollbackBlockers,
};
