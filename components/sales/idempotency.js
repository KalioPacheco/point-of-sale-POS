const { createHash } = require('crypto');

const id = value => String(value?._id || value || '').toLowerCase();
const money = value => Math.round(Number(value) * 100);

function requestFingerprint(sale) {
  const payment = sale.payment || {};
  const products = (sale.products || []).map(item => ({
    productId: id(item.productId), variantId: id(item.variantId), quantity: Number(item.quantity)
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const intent = {
    company: id(sale.companyId), cashier: id(sale.createdBy),
    shift: id(sale.shiftId), cashRegister: sale.cashRegister,
    customer: id(sale.customerId), coupon: String(sale.couponCode || '').trim().toUpperCase(),
    products,
    payment: {
      method: payment.method,
      reference: String(payment.reference || '').trim(),
      ...(payment.method === 'cash' ? { cashReceived: money(payment.cashReceived) } : {}),
      ...(payment.method === 'mixed' ? {
        cashAmount: money(payment.cashAmount), cardAmount: money(payment.cardAmount)
      } : {})
    }
  };
  return createHash('sha256').update(JSON.stringify(intent)).digest('hex');
}

function conflict(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

function validateReplay(existing, request) {
  if (id(existing.createdBy) !== id(request.createdBy)) {
    throw conflict('Sale not found', 404);
  }
  // Legacy checkouts can be compared against their immutable snapshots, not today's catalog.
  const storedFingerprint = existing.requestFingerprint || requestFingerprint({
    ...existing.toObject(), companyId: existing.company,
    shiftId: existing.shift, customerId: existing.customer
  });
  if (storedFingerprint !== requestFingerprint(request)) {
    throw conflict('Idempotency-Key already used for a different checkout');
  }
  if (existing.status !== 'confirmed' || existing.refund || existing.disable) {
    throw conflict('The original sale is no longer confirmed; do not charge again');
  }
  return existing;
}

module.exports = { requestFingerprint, validateReplay };
