const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const { Product, StockHistory } = require('../products/model');
const Supplier = require('../suppliers/model');
const { PurchaseReceipt, PhysicalCount, InventoryAdjustment } = require('./model');
const branchInventory = require('./branchInventory');

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
  const itemKeys = items.map((item, index) => `${ids[index]}:${item.variantId ? validObjectId(item.variantId, 'Variant ID') : ''}`);
  if (new Set(itemKeys).size !== itemKeys.length) throw domainError('A product or variant can appear only once per operation');
  return [...new Set(ids)];
}

function validateProductVariants(products, items) {
  for (const item of items) {
    const product = products.get(String(item.productId || item.product));
    const variantId = item.variantId ? validObjectId(item.variantId, 'Variant ID') : null;
    if (product.hasVariants) {
      if (!variantId) throw domainError(`Variant is required for ${product.name}`);
      const variant = product.variants.id(variantId);
      if (!variant || !variant.active) throw domainError(`Variant is not available for ${product.name}`, 404, 'RESOURCE_NOT_FOUND');
    } else if (variantId) {
      throw domainError(`${product.name} does not use variants`);
    }
  }
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
  const branchEnabled = await branchInventory.companyUsesBranchInventory(companyId);
  const branch = branchEnabled ? await branchInventory.activeBranch(companyId, input.branchId) : null;
  const fingerprint = requestFingerprint(companyId, [input.supplierId, reference, normalizedInput, input.receivedAt || null, input.notes || '', branch ? String(branch._id) : null]);

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
  validateProductVariants(products, input.items);
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
      branch: branch?._id,
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
  if (await branchInventory.companyUsesBranchInventory(companyId)) {
    return approveReceiptByBranch(receiptId, companyId, approverId, approvalNote);
  }
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
      const products = await activeProducts(companyId, [...new Set(receipt.items.map(item => String(item.product)))], session);
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

async function listReceipts(companyId, { status, supplierId, branchId } = {}) {
  const filter = { company: companyId };
  if (branchId) filter.branch = validObjectId(branchId, 'Branch ID');
  if (['pending', 'approved', 'cancelled'].includes(status)) filter.status = status;
  if (supplierId) filter.supplier = validObjectId(supplierId, 'Supplier ID');
  return PurchaseReceipt.find(filter)
    .populate('supplier', 'name taxId')
    .populate('createdBy approvedBy', 'name lastNames userName role')
    .sort({ receivedAt: -1, _id: -1 })
    .limit(100)
    .lean();
}

async function createPhysicalCount(input, companyId, userId, idempotencyKey) {
  const key = assertIdempotencyKey(idempotencyKey);
  const reference = requiredText(input.reference, 'Count reference');
  if (!Array.isArray(input.items) || input.items.length === 0) throw domainError('Count items are required');
  const productIds = uniqueProductIds(input.items);
  const branchEnabled = await branchInventory.companyUsesBranchInventory(companyId);
  const branch = branchEnabled ? await branchInventory.activeBranch(companyId, input.branchId) : null;
  const products = await activeProducts(companyId, productIds);
  validateProductVariants(products, input.items);
  const items = await Promise.all(input.items.map(async item => {
    const product = products.get(String(item.productId));
    let expectedVersion;
    if (branch) {
      const level = await branchInventory.getOrCreateLevel({ companyId, branchId: branch._id, product, variantId: item.variantId }, null);
      expectedVersion = Number(level.version);
    }
    return {
      product: product._id,
      nameSnapshot: product.name,
      countedQuantity: assertNonNegative(item.countedQuantity, 'Counted quantity'),
      ...(item.variantId ? { variantId: validObjectId(item.variantId, 'Variant ID') } : {}),
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    };
  }));
  const fingerprint = requestFingerprint(companyId, [
    branch ? String(branch._id) : null,
    reference,
    items.map(item => [String(item.product), item.variantId ? String(item.variantId) : null, item.countedQuantity]),
    input.countedAt || null,
    input.notes || '',
  ]);
  if (key) {
    const existing = await PhysicalCount.findOne({ company: companyId, idempotencyKey: key });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw domainError('Idempotency key already used for a different physical count', 409, 'CONFLICT');
      return existing;
    }
  }
  try {
    return await PhysicalCount.create({
      company: companyId,
      branch: branch?._id,
      reference,
      countedAt: input.countedAt ? new Date(input.countedAt) : new Date(),
      items,
      notes: typeof input.notes === 'string' ? input.notes.trim() : undefined,
      createdBy: userId,
      idempotencyKey: key || undefined,
      requestFingerprint: fingerprint,
    });
  } catch (error) {
    if (error.code === 11000 && key) {
      const existing = await PhysicalCount.findOne({ company: companyId, idempotencyKey: key });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw domainError('Idempotency key already used for a different physical count', 409, 'CONFLICT');
        return existing;
      }
    }
    throw error;
  }
}

async function approvePhysicalCount(countId, companyId, approverId, approvalNote) {
  validObjectId(countId, 'Count ID');
  if (await branchInventory.companyUsesBranchInventory(companyId)) {
    return approvePhysicalCountByBranch(countId, companyId, approverId, approvalNote);
  }
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
      const products = await activeProducts(companyId, [...new Set(count.items.map(item => String(item.product)))], session);
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

async function listPhysicalCounts(companyId, { status, branchId } = {}) {
  const filter = { company: companyId };
  if (branchId) filter.branch = validObjectId(branchId, 'Branch ID');
  if (['pending', 'approved', 'cancelled'].includes(status)) filter.status = status;
  return PhysicalCount.find(filter)
    .populate('createdBy approvedBy', 'name lastNames userName role')
    .sort({ countedAt: -1, _id: -1 })
    .limit(100)
    .lean();
}

async function createAdjustment(input, companyId, userId, idempotencyKey) {
  const key = assertIdempotencyKey(idempotencyKey);
  const productId = validObjectId(input.productId, 'Product ID');
  if (!['increase', 'decrease', 'set'].includes(input.type)) throw domainError('Adjustment type is invalid');
  const product = (await activeProducts(companyId, [productId])).get(productId);
  validateProductVariants(new Map([[String(product._id), product]]), [{ productId, variantId: input.variantId }]);
  const branchEnabled = await branchInventory.companyUsesBranchInventory(companyId);
  const branch = branchEnabled ? await branchInventory.activeBranch(companyId, input.branchId) : null;
  let expectedVersion;
  if (branch && input.type === 'set') {
    const level = await branchInventory.getOrCreateLevel({ companyId, branchId: branch._id, product, variantId: input.variantId }, null);
    expectedVersion = Number(level.version);
  }
  const quantity = assertNonNegative(input.quantity, 'Quantity');
  const reason = requiredText(input.reason, 'Reason');
  const variantId = input.variantId ? validObjectId(input.variantId, 'Variant ID') : undefined;
  const fingerprint = requestFingerprint(companyId, [branch ? String(branch._id) : null, productId, variantId || null, input.type, quantity, reason]);
  if (key) {
    const existing = await InventoryAdjustment.findOne({ company: companyId, idempotencyKey: key });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw domainError('Idempotency key already used for a different adjustment', 409, 'CONFLICT');
      return existing;
    }
  }
  try {
    return await InventoryAdjustment.create({
      company: companyId,
      branch: branch?._id,
      product: product._id,
      productNameSnapshot: product.name,
      type: input.type,
      quantity,
      reason,
      requestedBy: userId,
      ...(variantId ? { variantId } : {}),
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      idempotencyKey: key || undefined,
      requestFingerprint: fingerprint,
    });
  } catch (error) {
    if (error.code === 11000 && key) {
      const existing = await InventoryAdjustment.findOne({ company: companyId, idempotencyKey: key });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw domainError('Idempotency key already used for a different adjustment', 409, 'CONFLICT');
        return existing;
      }
    }
    throw error;
  }
}

async function approveAdjustment(adjustmentId, companyId, approverId, approvalNote) {
  validObjectId(adjustmentId, 'Adjustment ID');
  if (await branchInventory.companyUsesBranchInventory(companyId)) {
    return approveAdjustmentByBranch(adjustmentId, companyId, approverId, approvalNote);
  }
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

async function listAdjustments(companyId, { status, branchId } = {}) {
  const filter = { company: companyId };
  if (branchId) filter.branch = validObjectId(branchId, 'Branch ID');
  if (['pending', 'approved', 'cancelled'].includes(status)) filter.status = status;
  return InventoryAdjustment.find(filter)
    .populate('product', 'name code')
    .populate('requestedBy approvedBy', 'name lastNames userName role')
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .lean();
}

async function reorderReport(companyId, { branchId } = {}) {
  if (await branchInventory.companyUsesBranchInventory(companyId)) {
    return reorderReportByBranch(companyId, branchId);
  }
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

async function claimForApproval(Model, id, companyId, session, label) {
  const document = await Model.findOneAndUpdate(
    { _id: id, company: companyId, status: 'pending' },
    { $set: { status: 'processing' } },
    { new: true, session }
  );
  if (document) return document;
  const existing = await Model.findOne({ _id: id, company: companyId }).session(session);
  if (!existing) throw domainError(`${label} not found`, 404, 'RESOURCE_NOT_FOUND');
  if (existing.status === 'approved') return existing;
  throw domainError(`Only pending ${label.toLowerCase()}s can be approved`, 409, 'CONFLICT');
}

async function approveReceiptByBranch(receiptId, companyId, approverId, approvalNote) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const receipt = await claimForApproval(PurchaseReceipt, receiptId, companyId, session, 'Receipt');
      if (receipt.status === 'approved') { result = publicReceipt(receipt); return; }
      if (!receipt.branch) throw domainError('Receipt has no branch; reconcile it before approval', 409, 'BRANCH_REQUIRED');
      await branchInventory.activeBranch(companyId, receipt.branch, session);
      await getActiveSupplier(receipt.supplier, companyId, session);
      const products = await activeProducts(companyId, receipt.items.map(item => item.product), session);
      const enrichedItems = [];
      for (const item of receipt.items) {
        const product = products.get(String(item.product));
        const previousCost = Number(product.cost || 0);
        const level = await branchInventory.getOrCreateLevel({ companyId, branchId: receipt.branch, product, variantId: item.variantId }, session);
        const previousStock = Number(level.onHand);
        const newStock = previousStock + Number(item.quantity);
        const newCost = newStock === 0 ? Number(item.unitCost)
          : roundMoney(((previousStock * previousCost) + (Number(item.quantity) * Number(item.unitCost))) / newStock, 4);
        product.cost = newCost;
        product.updated = true;
        product.updatedAt = new Date();
        await product.save({ session });
        const updated = await branchInventory.mutateLevel({
          companyId, branchId: receipt.branch, product, variantId: item.variantId,
          delta: Number(item.quantity), type: 'receipt', sourceType: 'purchase_receipt',
          sourceId: receipt._id, actorId: approverId, idempotencyKey: receipt.idempotencyKey,
        }, session);
        enrichedItems.push({ ...item.toObject(), previousStock, newStock: Number(updated.onHand), previousCost, newCost });
      }
      receipt.items = enrichedItems;
      receipt.status = 'approved';
      receipt.approvedBy = approverId;
      receipt.approvedAt = new Date();
      receipt.approvalNote = typeof approvalNote === 'string' ? approvalNote.trim() : undefined;
      await receipt.save({ session });
      result = publicReceipt(receipt);
    });
  } finally { await session.endSession(); }
  return result;
}

async function approvePhysicalCountByBranch(countId, companyId, approverId, approvalNote) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const count = await claimForApproval(PhysicalCount, countId, companyId, session, 'Physical count');
      if (count.status === 'approved') { result = count.toObject(); return; }
      if (!count.branch) throw domainError('Physical count has no branch; reconcile it before approval', 409, 'BRANCH_REQUIRED');
      await branchInventory.activeBranch(companyId, count.branch, session);
      const products = await activeProducts(companyId, count.items.map(item => item.product), session);
      const enrichedItems = [];
      for (const item of count.items) {
        const product = products.get(String(item.product));
        const level = await branchInventory.getOrCreateLevel({ companyId, branchId: count.branch, product, variantId: item.variantId }, session);
        const previousStock = Number(level.onHand);
        const countedQuantity = Number(item.countedQuantity);
        const updated = await branchInventory.mutateLevel({
          companyId, branchId: count.branch, product, variantId: item.variantId,
          delta: countedQuantity - previousStock, expectedVersion: item.expectedVersion,
          type: 'physical_count', sourceType: 'physical_count', sourceId: count._id,
          actorId: approverId, idempotencyKey: String(count._id),
        }, session);
        enrichedItems.push({ ...item.toObject(), previousStock, difference: countedQuantity - previousStock, expectedVersion: Number(updated.version) });
      }
      count.items = enrichedItems;
      count.status = 'approved';
      count.approvedBy = approverId;
      count.approvedAt = new Date();
      count.approvalNote = typeof approvalNote === 'string' ? approvalNote.trim() : undefined;
      await count.save({ session });
      result = count.toObject();
    });
  } finally { await session.endSession(); }
  return result;
}

async function approveAdjustmentByBranch(adjustmentId, companyId, approverId, approvalNote) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const adjustment = await claimForApproval(InventoryAdjustment, adjustmentId, companyId, session, 'Adjustment');
      if (adjustment.status === 'approved') { result = adjustment.toObject(); return; }
      if (!adjustment.branch) throw domainError('Adjustment has no branch; reconcile it before approval', 409, 'BRANCH_REQUIRED');
      await branchInventory.activeBranch(companyId, adjustment.branch, session);
      const product = (await activeProducts(companyId, [adjustment.product], session)).get(String(adjustment.product));
      const level = await branchInventory.getOrCreateLevel({ companyId, branchId: adjustment.branch, product, variantId: adjustment.variantId }, session);
      const previousStock = Number(level.onHand);
      const proposed = Number(adjustment.quantity);
      const delta = adjustment.type === 'increase' ? proposed
        : adjustment.type === 'decrease' ? -proposed : proposed - previousStock;
      const updated = await branchInventory.mutateLevel({
        companyId, branchId: adjustment.branch, product, variantId: adjustment.variantId,
        delta, expectedVersion: adjustment.type === 'set' ? adjustment.expectedVersion : undefined,
        requireAvailable: adjustment.type === 'decrease', type: 'adjustment',
        sourceType: 'inventory_adjustment', sourceId: adjustment._id,
        actorId: approverId, idempotencyKey: String(adjustment._id),
      }, session);
      adjustment.status = 'approved';
      adjustment.approvedBy = approverId;
      adjustment.approvedAt = new Date();
      adjustment.approvalNote = typeof approvalNote === 'string' ? approvalNote.trim() : undefined;
      adjustment.previousStock = previousStock;
      adjustment.newStock = Number(updated.onHand);
      await adjustment.save({ session });
      result = adjustment.toObject();
    });
  } finally { await session.endSession(); }
  return result;
}

async function reorderReportByBranch(companyId, branchId) {
  if (!branchId) throw domainError('Branch is required', 400, 'BRANCH_REQUIRED');
  const levels = await branchInventory.listLevels(companyId, { branchId });
  return levels
    .map(level => {
      const product = level.product || {};
      const onHand = Number(level.onHand || 0);
      const reorderPoint = Number(product.reorderPoint || level.reorderPoint || 0);
      const reorderQuantity = Number(product.reorderQuantity || 0);
      return {
        _id: level._id,
        productId: product._id,
        variantId: level.variantId,
        name: level.variantId ? `${product.name} / ${(product.variants || []).find(variant => String(variant._id) === String(level.variantId))?.name || 'Variante'}` : product.name,
        code: product.code,
        stock: onHand,
        reserved: Number(level.reserved || 0),
        reorderPoint,
        reorderQuantity,
        version: Number(level.version || 0),
        suggestedQuantity: reorderQuantity > 0 ? reorderQuantity : Math.max(1, reorderPoint - onHand),
      };
    })
    .filter(item => item.reorderPoint > 0 && item.stock <= item.reorderPoint)
    .sort((left, right) => left.stock - right.stock || String(left.name).localeCompare(String(right.name)));
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
  getLevels: branchInventory.listLevels,
  createTransfer: branchInventory.createTransfer,
  transitionTransfer: branchInventory.transitionTransfer,
  listTransfers: branchInventory.listTransfers,
  companyUsesBranchInventory: branchInventory.companyUsesBranchInventory,
};
