const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const { Product, StockHistory } = require('../products/model');
const Supplier = require('../suppliers/model');
const { PurchaseReceipt, PhysicalCount, InventoryAdjustment } = require('./model');

function domainError(message, status = 400, code = 'INVENTORY_INVALID') {
  return Object.assign(new Error(message), { status, code });
}

function roundMoney(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function validObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw domainError(`${label} is invalid`);
  return String(value);
}

function uniqueProductIds(items) {
  const ids = items.map(item => validObjectId(item.productId, 'Product ID'));
  if (new Set(ids).size !== ids.length) throw domainError('A product can appear only once per operation');
  return ids;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw domainError(`${label} is required`);
  return value.trim();
}

function assertPositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw domainError(`${label} must be greater than zero`);
  return number;
}

function assertNonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw domainError(`${label} must be zero or greater`);
  return number;
}

function requestFingerprint(companyId, payload) {
  return createHash('sha256').update(JSON.stringify([String(companyId), payload])).digest('hex');
}

function assertIdempotencyKey(key) {
  if (key === undefined || key === null || key === '') return null;
  if (typeof key !== 'string' || key.trim().length > 200) throw domainError('Invalid idempotency key');
  return key.trim();
}

async function activeProducts(companyId, productIds, session = null) {
  const query = Product.find({ _id: { $in: productIds }, company: companyId, disable: false });
  if (session) query.session(session);
  const products = await query;
  if (products.length !== productIds.length) throw domainError('One or more products were not found', 404, 'RESOURCE_NOT_FOUND');
  return new Map(products.map(product => [String(product._id), product]));
}

async function getActiveSupplier(supplierId, companyId, session = null) {
  validObjectId(supplierId, 'Supplier ID');
  const query = Supplier.findOne({ _id: supplierId, company: companyId, disable: false });
  if (session) query.session(session);
  const supplier = await query;
  if (!supplier) throw domainError('Supplier not found', 404, 'RESOURCE_NOT_FOUND');
  return supplier;
}

function publicReceipt(receipt) {
  const data = receipt?.toObject ? receipt.toObject() : receipt;
  return data;
}

async function createReceipt(input, companyId, userId, idempotencyKey) {
  const key = assertIdempotencyKey(idempotencyKey);
  const reference = requiredText(input.reference, 'Receipt reference');
  if (!Array.isArray(input.items) || input.items.length === 0) throw domainError('Receipt items are required');
  const productIds = uniqueProductIds(input.items);
  const normalizedInput = input.items.map(item => ({
    productId: String(item.productId),
    quantity: assertPositive(item.quantity, 'Quantity'),
    unitCost: assertNonNegative(item.unitCost, 'Unit cost'),
  }));
  const fingerprint = requestFingerprint(companyId, [input.supplierId, reference, normalizedInput, input.receivedAt || null, input.notes || '']);

  if (key) {
    const existing = await PurchaseReceipt.findOne({ company: companyId, idempotencyKey: key });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw domainError('Idempotency key already used for a different receipt', 409, 'CONFLICT');
      return { receipt: publicReceipt(existing), replayed: true };
    }
  }

  const [supplier, products] = await Promise.all([
    getActiveSupplier(input.supplierId, companyId),
    activeProducts(companyId, productIds),
  ]);
  const duplicateReference = await PurchaseReceipt.exists({ company: companyId, supplier: supplier._id, reference });
  if (duplicateReference) throw domainError('A receipt with this supplier and reference already exists', 409, 'DUPLICATE_RESOURCE');

  const items = normalizedInput.map(item => {
    const product = products.get(item.productId);
    const lineTotal = roundMoney(item.quantity * item.unitCost, 2);
    return {
      product: product._id,
      nameSnapshot: product.name,
      quantity: item.quantity,
      unitCost: roundMoney(item.unitCost, 4),
      lineTotal,
    };
  });
  const totals = {
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    cost: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0), 2),
  };

  try {
    const receipt = await PurchaseReceipt.create({
      company: companyId,
      supplier: supplier._id,
      reference,
      receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
      items,
      totals,
      notes: typeof input.notes === 'string' ? input.notes.trim() : undefined,
      createdBy: userId,
      idempotencyKey: key || undefined,
      requestFingerprint: fingerprint,
    });
    return { receipt: publicReceipt(receipt), replayed: false };
  } catch (error) {
    if (error.code === 11000 && key) {
      const existing = await PurchaseReceipt.findOne({ company: companyId, idempotencyKey: key });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw domainError('Idempotency key already used for a different receipt', 409, 'CONFLICT');
        return { receipt: publicReceipt(existing), replayed: true };
      }
    }
    if (error.code === 11000) throw domainError('A receipt with this supplier and reference already exists', 409, 'DUPLICATE_RESOURCE');
    throw error;
  }
}

async function approveReceipt(receiptId, companyId, approverId, approvalNote) {
  validObjectId(receiptId, 'Receipt ID');
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const receipt = await PurchaseReceipt.findOneAndUpdate(
        { _id: receiptId, company: companyId, status: 'pending' },
        { $set: { status: 'processing' } },
        { new: true, session }
      );
      if (!receipt) {
        const exists = await PurchaseReceipt.exists({ _id: receiptId, company: companyId }).session(session);
        if (!exists) throw domainError('Receipt not found', 404, 'RESOURCE_NOT_FOUND');
        throw domainError('Only pending receipts can be approved', 409, 'CONFLICT');
      }
      await getActiveSupplier(receipt.supplier, companyId, session);
      const products = await activeProducts(companyId, receipt.items.map(item => item.product), session);
      const history = [];
      const enrichedItems = [];
      for (const item of receipt.items) {
        const product = products.get(String(item.product));
        const previousStock = Number(product.stock || 0);
        const previousCost = Number(product.cost || 0);
        const newStock = previousStock + Number(item.quantity);
        const weightedCost = newStock === 0
          ? Number(item.unitCost)
          : ((previousStock * previousCost) + (Number(item.quantity) * Number(item.unitCost))) / newStock;
        const newCost = roundMoney(weightedCost, 4);
        product.stock = newStock;
        product.cost = newCost;
        product.updated = true;
        product.updatedAt = new Date();
        await product.save({ session });
        enrichedItems.push({
          product: product._id,
          nameSnapshot: product.name,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
          lineTotal: Number(item.lineTotal),
          previousStock,
          newStock,
          previousCost,
          newCost,
        });
        history.push({
          product: product._id,
          user: receipt.createdBy,
          approvedBy: approverId,
          type: 'receipt',
          quantity: Number(item.quantity),
          previousStock,
          newStock,
          reason: `Recepción ${receipt.reference}`,
          sourceType: 'purchase_receipt',
          sourceId: receipt._id,
        });
      }
      await StockHistory.create(history, { session });
      receipt.items = enrichedItems;
      receipt.status = 'approved';
      receipt.approvedBy = approverId;
      receipt.approvedAt = new Date();
      receipt.approvalNote = typeof approvalNote === 'string' ? approvalNote.trim() : undefined;
      await receipt.save({ session });
      result = publicReceipt(receipt);
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function listReceipts(companyId, { status, supplierId } = {}) {
  const filter = { company: companyId };
  if (['pending', 'approved', 'cancelled'].includes(status)) filter.status = status;
  if (supplierId) filter.supplier = validObjectId(supplierId, 'Supplier ID');
  return PurchaseReceipt.find(filter)
    .populate('supplier', 'name taxId')
    .populate('createdBy approvedBy', 'name lastNames userName role')
    .sort({ receivedAt: -1, _id: -1 })
    .limit(100)
    .lean();
}

async function createPhysicalCount(input, companyId, userId) {
  const reference = requiredText(input.reference, 'Count reference');
  if (!Array.isArray(input.items) || input.items.length === 0) throw domainError('Count items are required');
  const productIds = uniqueProductIds(input.items);
  const products = await activeProducts(companyId, productIds);
  const items = input.items.map(item => {
    const product = products.get(String(item.productId));
    return {
      product: product._id,
      nameSnapshot: product.name,
      countedQuantity: assertNonNegative(item.countedQuantity, 'Counted quantity'),
    };
  });
  return PhysicalCount.create({
    company: companyId,
    reference,
    countedAt: input.countedAt ? new Date(input.countedAt) : new Date(),
    items,
    notes: typeof input.notes === 'string' ? input.notes.trim() : undefined,
    createdBy: userId,
  });
}

async function approvePhysicalCount(countId, companyId, approverId, approvalNote) {
  validObjectId(countId, 'Count ID');
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const count = await PhysicalCount.findOneAndUpdate(
        { _id: countId, company: companyId, status: 'pending' },
        { $set: { status: 'processing' } },
        { new: true, session }
      );
      if (!count) {
        const exists = await PhysicalCount.exists({ _id: countId, company: companyId }).session(session);
        if (!exists) throw domainError('Physical count not found', 404, 'RESOURCE_NOT_FOUND');
        throw domainError('Only pending physical counts can be approved', 409, 'CONFLICT');
      }
      const products = await activeProducts(companyId, count.items.map(item => item.product), session);
      const history = [];
      const enrichedItems = [];
      for (const item of count.items) {
        const product = products.get(String(item.product));
        const previousStock = Number(product.stock || 0);
        const countedQuantity = Number(item.countedQuantity);
        const difference = countedQuantity - previousStock;
        product.stock = countedQuantity;
        product.updated = true;
        product.updatedAt = new Date();
        await product.save({ session });
        enrichedItems.push({ product: product._id, nameSnapshot: product.name, countedQuantity, previousStock, difference });
        history.push({
          product: product._id,
          user: count.createdBy,
          approvedBy: approverId,
          type: 'physical_count',
          quantity: Math.abs(difference),
          previousStock,
          newStock: countedQuantity,
          reason: `Conteo físico ${count.reference}`,
          sourceType: 'physical_count',
          sourceId: count._id,
        });
      }
      await StockHistory.create(history, { session });
      count.items = enrichedItems;
      count.status = 'approved';
      count.approvedBy = approverId;
      count.approvedAt = new Date();
      count.approvalNote = typeof approvalNote === 'string' ? approvalNote.trim() : undefined;
      await count.save({ session });
      result = count.toObject();
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function listPhysicalCounts(companyId, { status } = {}) {
  const filter = { company: companyId };
  if (['pending', 'approved', 'cancelled'].includes(status)) filter.status = status;
  return PhysicalCount.find(filter)
    .populate('createdBy approvedBy', 'name lastNames userName role')
    .sort({ countedAt: -1, _id: -1 })
    .limit(100)
    .lean();
}

async function createAdjustment(input, companyId, userId) {
  const productId = validObjectId(input.productId, 'Product ID');
  if (!['increase', 'decrease', 'set'].includes(input.type)) throw domainError('Adjustment type is invalid');
  const product = (await activeProducts(companyId, [productId])).get(productId);
  return InventoryAdjustment.create({
    company: companyId,
    product: product._id,
    productNameSnapshot: product.name,
    type: input.type,
    quantity: assertNonNegative(input.quantity, 'Quantity'),
    reason: requiredText(input.reason, 'Reason'),
    requestedBy: userId,
  });
}

async function approveAdjustment(adjustmentId, companyId, approverId, approvalNote) {
  validObjectId(adjustmentId, 'Adjustment ID');
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const adjustment = await InventoryAdjustment.findOneAndUpdate(
        { _id: adjustmentId, company: companyId, status: 'pending' },
        { $set: { status: 'processing' } },
        { new: true, session }
      );
      if (!adjustment) {
        const exists = await InventoryAdjustment.exists({ _id: adjustmentId, company: companyId }).session(session);
        if (!exists) throw domainError('Adjustment not found', 404, 'RESOURCE_NOT_FOUND');
        throw domainError('Only pending adjustments can be approved', 409, 'CONFLICT');
      }
      const product = (await activeProducts(companyId, [adjustment.product], session)).get(String(adjustment.product));
      const previousStock = Number(product.stock || 0);
      const proposed = Number(adjustment.quantity);
      const newStock = adjustment.type === 'increase'
        ? previousStock + proposed
        : adjustment.type === 'decrease'
          ? previousStock - proposed
          : proposed;
      if (newStock < 0) throw domainError(`Insufficient stock. Available: ${previousStock}`, 409, 'INSUFFICIENT_STOCK');
      product.stock = newStock;
      product.updated = true;
      product.updatedAt = new Date();
      await product.save({ session });
      await StockHistory.create([{
        product: product._id,
        user: adjustment.requestedBy,
        approvedBy: approverId,
        type: 'adjustment',
        quantity: adjustment.type === 'set' ? Math.abs(newStock - previousStock) : proposed,
        previousStock,
        newStock,
        reason: adjustment.reason,
        sourceType: 'inventory_adjustment',
        sourceId: adjustment._id,
      }], { session });
      adjustment.status = 'approved';
      adjustment.approvedBy = approverId;
      adjustment.approvedAt = new Date();
      adjustment.approvalNote = typeof approvalNote === 'string' ? approvalNote.trim() : undefined;
      adjustment.previousStock = previousStock;
      adjustment.newStock = newStock;
      await adjustment.save({ session });
      result = adjustment.toObject();
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function listAdjustments(companyId, { status } = {}) {
  const filter = { company: companyId };
  if (['pending', 'approved', 'cancelled'].includes(status)) filter.status = status;
  return InventoryAdjustment.find(filter)
    .populate('product', 'name code')
    .populate('requestedBy approvedBy', 'name lastNames userName role')
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .lean();
}

async function reorderReport(companyId) {
  const products = await Product.find({
    company: companyId,
    disable: false,
    reorderPoint: { $gt: 0 },
    $expr: { $lte: ['$stock', '$reorderPoint'] },
  })
    .select('name code stock cost reorderPoint reorderQuantity')
    .sort({ stock: 1, name: 1 })
    .lean();
  return products.map(product => {
    const currentStock = Number(product.stock || 0);
    const reorderPoint = Number(product.reorderPoint || 0);
    const configuredQuantity = Number(product.reorderQuantity || 0);
    return {
      ...product,
      suggestedQuantity: configuredQuantity > 0 ? configuredQuantity : Math.max(1, reorderPoint - currentStock),
    };
  });
}

module.exports = {
  createReceipt,
  approveReceipt,
  listReceipts,
  createPhysicalCount,
  approvePhysicalCount,
  listPhysicalCounts,
  createAdjustment,
  approveAdjustment,
  listAdjustments,
  reorderReport,
};
