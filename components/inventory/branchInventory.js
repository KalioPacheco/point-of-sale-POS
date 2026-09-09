const mongoose = require('mongoose');
const Company = require('../companies/model');
const Branch = require('../branches/model');
const { Product } = require('../products/model');
const {
  InventoryLevel,
  InventoryMovement,
  StockTransfer,
} = require('./model');

function domainError(message, status = 400, code = 'INVENTORY_INVALID') {
  return Object.assign(new Error(message), { status, code });
}

function objectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw domainError(`${label} is invalid`);
  return String(value);
}

function positive(value, label = 'Quantity') {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw domainError(`${label} must be greater than zero`);
  return number;
}

function nonNegative(value, label = 'Quantity') {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw domainError(`${label} must be zero or greater`);
  return number;
}

function optionalKey(key) {
  if (key === undefined || key === null || key === '') return undefined;
  if (typeof key !== 'string' || !key.trim() || key.trim().length > 200) {
    throw domainError('Invalid idempotency key');
  }
  return key.trim();
}

async function companyUsesBranchInventory(companyId, session = null) {
  let query = Company.findById(companyId).select('featureFlags.multiBranchInventory');
  if (session) query = query.session(session);
  const company = await query.lean();
  return Boolean(company?.featureFlags?.multiBranchInventory);
}

async function activeBranch(companyId, branchId, session = null) {
  objectId(branchId, 'Branch ID');
  let query = Branch.findOne({ _id: branchId, company: companyId, active: true });
  if (session) query = query.session(session);
  const branch = await query.lean();
  if (!branch) throw domainError('Branch not found', 404, 'RESOURCE_NOT_FOUND');
  return branch;
}

async function activeProducts(companyId, entries, session = null) {
  const productIds = [...new Set(entries.map(item => objectId(item.productId || item.product, 'Product ID')))];
  let query = Product.find({ _id: { $in: productIds }, company: companyId, disable: false });
  if (session) query = query.session(session);
  const products = await query;
  if (products.length !== productIds.length) throw domainError('One or more products were not found', 404, 'RESOURCE_NOT_FOUND');
  const byId = new Map(products.map(product => [String(product._id), product]));
  for (const entry of entries) {
    const product = byId.get(String(entry.productId || entry.product));
    const variantId = entry.variantId ? objectId(entry.variantId, 'Variant ID') : null;
    if (product.hasVariants) {
      if (!variantId) throw domainError(`Variant is required for ${product.name}`);
      const variant = product.variants.id(variantId);
      if (!variant || !variant.active) throw domainError(`Variant is not available for ${product.name}`, 404, 'RESOURCE_NOT_FOUND');
    } else if (variantId) {
      throw domainError(`${product.name} does not use variants`);
    }
  }
  return byId;
}

function levelFilter({ companyId, branchId, productId, variantId }) {
  return {
    company: companyId,
    branch: branchId,
    product: productId,
    ...(variantId ? { variantId } : { variantId: { $exists: false } }),
  };
}

async function getOrCreateLevel({ companyId, branchId, product, variantId }, session) {
  const filter = levelFilter({ companyId, branchId, productId: product._id || product, variantId });
  const setOnInsert = {
    company: companyId,
    branch: branchId,
    product: product._id || product,
    ...(variantId ? { variantId } : {}),
    onHand: 0,
    reserved: 0,
    reorderPoint: Number(product.reorderPoint || 0),
    version: 0,
  };
  try {
    return await InventoryLevel.findOneAndUpdate(
      filter,
      { $setOnInsert: setOnInsert },
      { new: true, upsert: true, session, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return InventoryLevel.findOne(filter).session(session);
  }
}

async function getLevel({ companyId, branchId, productId, variantId }, session = null) {
  let query = InventoryLevel.findOne(levelFilter({ companyId, branchId, productId, variantId }));
  if (session) query = query.session(session);
  return query;
}

async function writeMovement({ level, type, quantity, before, after, reservedBefore, reservedAfter, sourceType, sourceId, actorId, idempotencyKey }, session) {
  await InventoryMovement.create([{
    company: level.company,
    branch: level.branch,
    product: level.product,
    ...(level.variantId ? { variantId: level.variantId } : {}),
    type,
    quantity,
    before,
    after,
    reservedBefore,
    reservedAfter,
    version: level.version,
    sourceType,
    sourceId,
    actor: actorId,
    idempotencyKey: optionalKey(idempotencyKey),
  }], { session });
}

/**
 * Apply a balance mutation using the optimistic version as a compare-and-swap
 * guard. The transaction retries on a write conflict, while this guard gives
 * count/set callers a useful stale-version conflict instead of a lost update.
 */
async function mutateLevel({
  companyId,
  branchId,
  product,
  variantId,
  delta = 0,
  reservedDelta = 0,
  expectedVersion,
  requireAvailable = false,
  type,
  sourceType,
  sourceId,
  actorId,
  idempotencyKey,
}, session) {
  const level = await getOrCreateLevel({ companyId, branchId, product, variantId }, session);
  const before = Number(level.onHand || 0);
  const reservedBefore = Number(level.reserved || 0);
  if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== Number(level.version)) {
    throw domainError('Inventory level changed; reload before confirming the count', 409, 'STALE_INVENTORY_VERSION');
  }
  if (before + delta < 0) {
    throw domainError(`Insufficient stock. Available: ${before}`, 409, 'INSUFFICIENT_STOCK');
  }
  if (reservedBefore + reservedDelta < 0) {
    throw domainError('Transfer reservation is no longer available', 409, 'CONFLICT');
  }
  if (before + delta < reservedBefore + reservedDelta) {
    throw domainError('The operation would consume stock reserved for a transfer', 409, 'INSUFFICIENT_STOCK');
  }
  if (requireAvailable && before - reservedBefore + delta < 0) {
    throw domainError(`Insufficient available stock. Available: ${before - reservedBefore}`, 409, 'INSUFFICIENT_STOCK');
  }
  const filter = { _id: level._id, version: level.version };
  const updated = await InventoryLevel.findOneAndUpdate(
    filter,
    { $inc: { onHand: delta, reserved: reservedDelta, version: 1 } },
    { new: true, session }
  );
  if (!updated) throw domainError('Inventory level changed; retry the operation', 409, 'INVENTORY_CONFLICT');
  await writeMovement({
    level: updated,
    type,
    quantity: delta,
    before,
    after: Number(updated.onHand),
    reservedBefore,
    reservedAfter: Number(updated.reserved),
    sourceType,
    sourceId,
    actorId,
    idempotencyKey,
  }, session);
  return updated;
}

async function consumeSaleItems({ items, companyId, branchId, actorId, saleId }, session) {
  if (!branchId) throw domainError('Branch is required for multi-branch inventory', 400, 'BRANCH_REQUIRED');
  const products = await activeProducts(companyId, items, session);
  for (const item of items) {
    const product = products.get(String(item.productId));
    const variantId = item.variantId ? String(item.variantId) : undefined;
    await mutateLevel({
      companyId, branchId, product, variantId,
      delta: -positive(item.quantity),
      requireAvailable: true,
      type: 'sale', sourceType: 'sale', sourceId: saleId, actorId,
      idempotencyKey: String(saleId),
    }, session);
  }
}

async function restoreSaleItems({ items, companyId, branchId, actorId, saleId }, session) {
  if (!branchId) throw domainError('Original sale has no branch attribution', 409, 'BRANCH_REQUIRED');
  const products = await activeProducts(companyId, items, session);
  for (const item of items) {
    const product = products.get(String(item.productId));
    const variantId = item.variantId ? String(item.variantId) : undefined;
    await mutateLevel({
      companyId, branchId, product, variantId,
      delta: positive(item.quantity),
      type: 'refund', sourceType: 'refund', sourceId: saleId, actorId,
      idempotencyKey: `refund:${saleId}`,
    }, session);
  }
}

function normalizeTransferItems(items, products) {
  if (!Array.isArray(items) || items.length === 0) throw domainError('Transfer items are required');
  const seen = new Set();
  return items.map(item => {
    const productId = objectId(item.productId, 'Product ID');
    const variantId = item.variantId ? objectId(item.variantId, 'Variant ID') : undefined;
    const key = `${productId}:${variantId || ''}`;
    if (seen.has(key)) throw domainError('A product or variant can appear only once per transfer');
    seen.add(key);
    const product = products.get(productId);
    const variant = variantId ? product.variants.id(variantId) : null;
    return {
      product: product._id,
      ...(variantId ? { variantId } : {}),
      nameSnapshot: variant ? `${product.name} / ${variant.name}` : product.name,
      quantity: positive(item.quantity),
    };
  });
}

function transferFingerprint(companyId, input) {
  const crypto = require('node:crypto'); // lazy to keep startup modules lean
  return crypto.createHash('sha256').update(JSON.stringify([String(companyId), input])).digest('hex');
}

async function createTransfer(input, companyId, actorId, idempotencyKey, session = null) {
  const key = optionalKey(idempotencyKey);
  const originBranch = await activeBranch(companyId, input.originBranchId, session);
  const destinationBranch = await activeBranch(companyId, input.destinationBranchId, session);
  if (String(originBranch._id) === String(destinationBranch._id)) throw domainError('Origin and destination branches must be different');
  const products = await activeProducts(companyId, input.items || [], session);
  const items = normalizeTransferItems(input.items, products);
  const payload = [String(originBranch._id), String(destinationBranch._id), items.map(item => [String(item.product), item.variantId ? String(item.variantId) : null, item.quantity]), input.reason || ''];
  const fingerprint = transferFingerprint(companyId, payload);
  if (key) {
    const existing = await StockTransfer.findOne({ company: companyId, idempotencyKey: key }).session(session || null);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw domainError('Idempotency key already used for a different transfer', 409, 'CONFLICT');
      return { transfer: existing.toObject(), replayed: true };
    }
  }
  try {
    const transfer = await StockTransfer.create([{
      company: companyId,
      originBranch: originBranch._id,
      destinationBranch: destinationBranch._id,
      items,
      reason: typeof input.reason === 'string' ? input.reason.trim() : undefined,
      requestedBy: actorId,
      idempotencyKey: key,
      requestFingerprint: fingerprint,
    }], session ? { session } : undefined);
    return { transfer: transfer[0].toObject(), replayed: false };
  } catch (error) {
    if (error.code === 11000 && key) {
      const existing = await StockTransfer.findOne({ company: companyId, idempotencyKey: key });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw domainError('Idempotency key already used for a different transfer', 409, 'CONFLICT');
        return { transfer: existing.toObject(), replayed: true };
      }
    }
    throw error;
  }
}

async function transitionTransfer(transferId, companyId, actor, action) {
  objectId(transferId, 'Transfer ID');
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const transfer = await StockTransfer.findOne({ _id: transferId, company: companyId }).session(session);
      if (!transfer) throw domainError('Transfer not found', 404, 'RESOURCE_NOT_FOUND');
      const actorId = actor.userId || actor.id || actor;
      const role = actor.role;
      const products = await activeProducts(companyId, transfer.items, session);
      const mutateItems = async (direction) => {
        for (const item of transfer.items) {
          const product = products.get(String(item.product));
          const common = { companyId, product, variantId: item.variantId ? String(item.variantId) : undefined, sourceType: 'stock_transfer', sourceId: transfer._id, actorId, idempotencyKey: `${transfer._id}:${action}` };
          if (direction === 'approve') await mutateLevel({ ...common, branchId: transfer.originBranch, delta: 0, reservedDelta: Number(item.quantity), requireAvailable: true, type: 'transfer_approved' }, session);
          if (direction === 'dispatch') await mutateLevel({ ...common, branchId: transfer.originBranch, delta: -Number(item.quantity), reservedDelta: -Number(item.quantity), type: 'transfer_dispatched' }, session);
          if (direction === 'receive') await mutateLevel({ ...common, branchId: transfer.destinationBranch, delta: Number(item.quantity), type: 'transfer_received' }, session);
          if (direction === 'cancel') await mutateLevel({ ...common, branchId: transfer.originBranch, delta: 0, reservedDelta: -Number(item.quantity), type: 'transfer_cancelled' }, session);
        }
      };

      if (action === 'approve') {
        if (!['admin', 'manager'].includes(role)) throw domainError('Only a manager or admin can approve a transfer', 403, 'FORBIDDEN');
        if (transfer.status === 'approved') { result = transfer.toObject(); return; }
        if (transfer.status !== 'requested') throw domainError('Only requested transfers can be approved', 409, 'CONFLICT');
        await mutateItems('approve');
        transfer.status = 'approved';
        transfer.approvedBy = actorId;
        transfer.approvedAt = new Date();
        transfer.selfApproved = String(transfer.requestedBy) === String(actorId) && role === 'manager';
      } else if (action === 'dispatch') {
        if (!['admin', 'manager'].includes(role)) throw domainError('Only a manager or admin can dispatch a transfer', 403, 'FORBIDDEN');
        if (transfer.status === 'in_transit') { result = transfer.toObject(); return; }
        if (transfer.status !== 'approved') throw domainError('Only approved transfers can be dispatched', 409, 'CONFLICT');
        await mutateItems('dispatch');
        transfer.status = 'in_transit';
        transfer.dispatchedBy = actorId;
        transfer.dispatchedAt = new Date();
      } else if (action === 'receive') {
        if (transfer.status === 'received') { result = transfer.toObject(); return; }
        if (transfer.status !== 'in_transit') throw domainError('Only in-transit transfers can be received', 409, 'CONFLICT');
        await mutateItems('receive');
        transfer.status = 'received';
        transfer.receivedBy = actorId;
        transfer.receivedAt = new Date();
      } else if (action === 'cancel') {
        if (transfer.status === 'cancelled') { result = transfer.toObject(); return; }
        if (transfer.status === 'requested') {
          // No reservation has been made yet.
        } else if (transfer.status === 'approved') {
          await mutateItems('cancel');
        } else {
          throw domainError('Only requested or approved transfers can be cancelled', 409, 'CONFLICT');
        }
        transfer.status = 'cancelled';
        transfer.cancelledBy = actorId;
        transfer.cancelledAt = new Date();
      } else {
        throw domainError('Unknown transfer action');
      }
      await transfer.save({ session });
      result = transfer.toObject();
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function listLevels(companyId, { branchId, consolidated = false } = {}) {
  if (!consolidated && !branchId) throw domainError('Branch is required', 400, 'BRANCH_REQUIRED');
  if (consolidated) {
    return InventoryLevel.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId) } },
      { $group: { _id: { product: '$product', variantId: '$variantId' }, onHand: { $sum: '$onHand' }, reserved: { $sum: '$reserved' }, branches: { $sum: 1 } } },
      { $lookup: { from: 'products', localField: '_id.product', foreignField: '_id', as: 'productDoc' } },
      { $unwind: '$productDoc' },
      { $project: { _id: 0, product: '$_id.product', variantId: '$_id.variantId', onHand: 1, reserved: 1, branches: 1, name: '$productDoc.name', code: '$productDoc.code' } },
      { $sort: { name: 1 } },
    ]);
  }
  return InventoryLevel.find({ company: companyId, branch: branchId })
    .populate('product', 'name code reorderPoint reorderQuantity variants')
    .sort({ updatedAt: -1, _id: -1 })
    .lean();
}

async function listTransfers(companyId, { branchIds } = {}) {
  const filter = { company: companyId };
  if (Array.isArray(branchIds)) {
    if (branchIds.length === 0) return [];
    filter.$or = [{ originBranch: { $in: branchIds } }, { destinationBranch: { $in: branchIds } }];
  }
  return StockTransfer.find(filter)
    .populate('originBranch destinationBranch', 'name code')
    .populate('requestedBy approvedBy dispatchedBy receivedBy cancelledBy', 'name lastNames userName role')
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .lean();
}

module.exports = {
  domainError,
  positive,
  nonNegative,
  optionalKey,
  companyUsesBranchInventory,
  activeBranch,
  activeProducts,
  getLevel,
  getOrCreateLevel,
  mutateLevel,
  consumeSaleItems,
  restoreSaleItems,
  createTransfer,
  transitionTransfer,
  listLevels,
  listTransfers,
};
