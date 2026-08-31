const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const { Product, StockHistory } = require('./model');

// The native _id index protects retries without an index migration on legacy history.
const Adjustment = mongoose.model('StockAdjustment', new mongoose.Schema({
  _id: String,
  fingerprint: { type: String, required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true }), 'stockAdjustments');

function conflict(message) {
  const error = new Error(message);
  error.code = 'STOCK_CONFLICT';
  return error;
}

async function adjustStock(type, productId, quantity, userId, reason, companyId, options = {}) {
  if (!Number.isFinite(quantity) || quantity < 0 || (type !== 'set' && quantity === 0)) {
    throw new Error('Quantity must be a finite non-negative number (positive for add/reduce)');
  }
  if (options.expectedStock !== undefined && !Number.isFinite(options.expectedStock)) {
    throw new Error('Expected stock must be a finite number');
  }
  const key = options.idempotencyKey;
  if (key !== undefined && (typeof key !== 'string' || !key.trim() || key.length > 200)) {
    throw new Error('Invalid idempotency key');
  }
  const fingerprint = JSON.stringify([String(productId), type, quantity, String(userId), reason,
    options.expectedStock ?? null]);
  const operationId = key ? createHash('sha256').update(JSON.stringify([String(companyId), key])).digest('hex') : null;
  const replay = (operation) => {
    if (operation.fingerprint !== fingerprint) throw conflict('Idempotency key already used for a different adjustment');
    return operation.result;
  };
  if (operationId) await Adjustment.init();
  const session = await mongoose.startSession();
  let result;
  // Keep the first observed stock on set retries: never overwrite a concurrent sale.
  let expectedStock = options.expectedStock;
  try {
    await session.withTransaction(async () => {
      if (operationId) {
        const existing = await Adjustment.findById(operationId).session(session);
        if (existing) { result = replay(existing); return; }
      }
      const filter = { _id: productId, disable: false };
      if (companyId) filter.company = companyId;
      const product = await Product.findOne(filter).session(session);
      if (!product) throw new Error('Product not found');
      const previousStock = product.stock || 0;
      if (type === 'set' && expectedStock === undefined) expectedStock = previousStock;
      if (expectedStock !== undefined && expectedStock !== previousStock) {
        throw conflict('Stock conflict: reload the product before adjusting stock');
      }
      const newStock = type === 'set' ? quantity : previousStock + (type === 'add' ? quantity : -quantity);
      if (!Number.isFinite(newStock)) throw new Error('Invalid resulting stock');
      if (newStock < 0) {
        const error = new Error(`Stock insuficiente. Disponible: ${previousStock}, solicitado: ${quantity}`);
        error.code = 'INSUFFICIENT_STOCK';
        error.available = previousStock;
        error.requested = quantity;
        throw error;
      }
      product.stock = newStock;
      product.updated = true;
      product.updatedAt = new Date();
      await product.save({ session });
      await StockHistory.create([{
        product: productId, user: userId, type, quantity, previousStock, newStock, reason
      }], { session });
      result = {
        success: true,
        product: {
          id: product._id, name: product.name, previousStock, newStock, reason, user: userId,
          ...(type === 'add' ? { quantityAdded: quantity } : {}),
          ...(type === 'reduce' ? { quantityReduced: quantity } : {}),
          ...(type === 'set' ? { difference: newStock - previousStock } : {})
        },
        message: `Stock adjusted successfully. New stock: ${newStock}`
      };
      if (operationId) await Adjustment.create([{ _id: operationId, fingerprint, result }], { session });
    });
  } catch (error) {
    if (operationId && error.code === 11000) {
      const existing = await Adjustment.findById(operationId);
      if (existing) return replay(existing);
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}

module.exports = { adjustStock, Adjustment };
