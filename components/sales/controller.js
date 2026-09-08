const mongoose = require('mongoose');
const store = require('./store');
const { requestFingerprint, validateReplay } = require('./idempotency');
const Sale = require('./model');
const { Product, StockHistory } = require('../products/model');
const Coupon = require('../coupons/model');
const CashMovement = require('../cashMovements/model');
const CashRegisterShift = require('../cashRegisterShifts/model');
const Ticket = require('../ticket/model');
const Company = require('../companies/model');
const { InventoryLevel } = require('../inventory/model');
const branchInventory = require('../inventory/branchInventory');
const Customer = require('../customer/model');
const User = require('../users/model');
const couponsController = require('../coupons/controller');
const promotionsController = require('../promotions/controller');

// Product snapshots populate these refs, so sales must register them independently of route load order.
require('../brands/model'); // eslint-disable-line global-require
require('../categories/model'); // eslint-disable-line global-require

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function normalizePayment(payment = {}, total) {
  const method = payment.method;
  const normalized = {
    method,
    amount: roundMoney(total),
    cashReceived: 0,
    change: 0,
    cashAmount: 0,
    cardAmount: 0,
    reference: payment.reference?.trim() || undefined
  };

  if (method === 'cash') {
    normalized.cashReceived = roundMoney(payment.cashReceived);
    if (!Number.isFinite(normalized.cashReceived) || normalized.cashReceived < total) {
      throw new Error('El efectivo recibido debe cubrir el total');
    }
    normalized.cashAmount = roundMoney(total);
    normalized.change = roundMoney(normalized.cashReceived - total);
    return normalized;
  }

  if (method === 'card' || method === 'transfer') {
    if (!normalized.reference) throw new Error('La referencia de pago es requerida');
    normalized.cardAmount = roundMoney(total);
    return normalized;
  }

  if (method === 'mixed') {
    normalized.cashAmount = roundMoney(payment.cashAmount);
    normalized.cardAmount = roundMoney(payment.cardAmount);
    if (!Number.isFinite(normalized.cashAmount) || normalized.cashAmount < 0 ||
        !Number.isFinite(normalized.cardAmount) || normalized.cardAmount < 0) {
      throw new Error('Los importes del pago mixto deben ser numeros no negativos');
    }
    if (roundMoney(normalized.cashAmount + normalized.cardAmount) !== roundMoney(total)) {
      throw new Error('La suma del pago mixto debe coincidir con el total');
    }
    if (normalized.cardAmount > 0 && !normalized.reference) {
      throw new Error('La referencia del pago mixto es requerida');
    }
    normalized.cashReceived = normalized.cashAmount;
    return normalized;
  }

  throw new Error('Metodo de pago invalido');
}

async function createProductSnapshots(products, companyId, session = null, branchId = null) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Products array is required');
  }
  if (!companyId) throw new Error('Company scope is required');

  const productIds = [...new Set(products.map(item => String(item.productId)))];
  let query = Product.find({
    _id: { $in: productIds },
    company: companyId,
    disable: false
  }).populate('brand', 'name').populate('categories', 'name');
  if (session) query = query.session(session);
  const catalog = await query.exec();
  const byId = new Map(catalog.map(product => [String(product._id), product]));

  const usesBranchInventory = await branchInventory.companyUsesBranchInventory(companyId, session);
  if (usesBranchInventory && !branchId) {
    throw Object.assign(new Error('Sucursal requerida para vender'), { status: 400, code: 'BRANCH_REQUIRED' });
  }
  if (usesBranchInventory) await branchInventory.activeBranch(companyId, branchId, session);
  const levels = usesBranchInventory
    ? await InventoryLevel.find({ company: companyId, branch: branchId, product: { $in: productIds } }).session(session).lean()
    : [];
  const levelByItem = new Map(levels.map(level => [
    `${String(level.product)}:${level.variantId ? String(level.variantId) : ''}`,
    level,
  ]));

  return products.map(item => {
    const product = byId.get(String(item.productId));
    if (!product) throw new Error('Product ' + item.productId + ' not found in company');

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Invalid product quantity');

    let variant = null;
    if (product.hasVariants) {
      if (!item.variantId) throw new Error('Variant required for ' + product.name);
      variant = product.variants.id(item.variantId);
      if (!variant || !variant.active) throw new Error('Variant not available for ' + product.name);
    } else if (item.variantId) {
      throw new Error('Product ' + product.name + ' does not use variants');
    }

    const price = roundMoney(variant?.price ?? product.price ?? 0);
    if (!Number.isFinite(price) || price < 0) throw new Error('Invalid catalog price for ' + product.name);
    const subtotal = roundMoney(price * quantity);
    const taxRate = product.taxExempt ? 0 : Number(product.taxRate || 0);
    const taxAmount = roundMoney((subtotal * taxRate) / 100);

    return {
      productId: product._id,
      variantId: variant?._id,
      variantName: variant?.name,
      quantity,
      availableStock: usesBranchInventory
        ? Math.max(0, Number(levelByItem.get(`${String(product._id)}:${variant ? String(variant._id) : ''}`)?.onHand || 0)
          - Number(levelByItem.get(`${String(product._id)}:${variant ? String(variant._id) : ''}`)?.reserved || 0))
        : Number(variant ? variant.stock : product.stock) || 0,
      priceSnapshot: {
        name: product.name,
        price,
        cost: Number(product.cost || 0),
        taxRate,
        taxExempt: Boolean(product.taxExempt),
        snapshotDate: new Date(),
        brand: product.brand?.name || '',
        category: product.categories?.[0]?.name || '',
        categoryIds: (product.categories || []).map(category => category._id || category),
        sku: variant?.sku || product.sku || '',
        description: product.description || ''
      },
      subtotal,
      taxAmount,
      total: roundMoney(subtotal + taxAmount)
    };
  });
}

function calculateSnapshotTotals(productSnapshots) {
  const subtotal = roundMoney(productSnapshots.reduce(
    (sum, item) => sum + (item.taxableSubtotal ?? item.subtotal), 0,
  ));
  const totalTaxes = roundMoney(productSnapshots.reduce((sum, item) => sum + item.taxAmount, 0));
  return { subtotal, totalTaxes, total: roundMoney(subtotal + totalTaxes) };
}

function applyPromotionQuoteToSnapshots(productSnapshots, quote) {
  const allocations = new Map((quote.lineAllocations || []).map(allocation => [
    allocation.lineIndex,
    allocation,
  ]));
  return productSnapshots.map((snapshot, index) => {
    const allocation = allocations.get(index);
    if (!allocation) return snapshot;
    return {
      ...snapshot,
      discountAmount: allocation.discount,
      taxableSubtotal: allocation.taxableSubtotal,
      taxAmount: allocation.taxAmount,
      total: allocation.total,
    };
  });
}

async function activePromotionsForCheckout(companyId, at, session) {
  // The engine is deployable before activation.  Existing tenants remain on
  // their legacy checkout until M5 enables the already-present company flag.
  const companyQuery = Company.findById(companyId).select('featureFlags.promotionsV1');
  if (session) companyQuery.session(session);
  const company = await companyQuery.lean();
  if (!company?.featureFlags?.promotionsV1) return [];
  return promotionsController.listActive(companyId, at, session);
}

async function prepareSale(saleData, session = null) {
  const productSnapshots = await createProductSnapshots(
    saleData.products,
    saleData.companyId,
    session,
    saleData.branchId
  );
  const originalTotals = calculateSnapshotTotals(productSnapshots);
  let couponValidation = null;

  if (saleData.couponCode) {
    couponValidation = await couponsController.validateCoupon(
      saleData.couponCode,
      saleData.companyId,
      {
        ...originalTotals,
        products: productSnapshots.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          price: item.priceSnapshot.price
        }))
      },
      saleData.customerId,
      session
    );
    if (!couponValidation.valid) throw new Error(couponValidation.error);
  }

  const promotions = await activePromotionsForCheckout(saleData.companyId, new Date(), session);
  const quote = promotionsController.quote({
    companyId: saleData.companyId,
    products: productSnapshots,
    customerId: saleData.customerId,
    branchId: saleData.branchId,
    now: new Date(),
    promotions,
    coupon: couponValidation ? {
      valid: true,
      discountAmount: couponValidation.discount.discountAmount,
    } : null,
    taxPolicyVersion: 'promotion_v1_before_tax',
  });
  const quotedSnapshots = applyPromotionQuoteToSnapshots(productSnapshots, quote);
  const couponApplied = Boolean(quote.coupon?.applied);
  const couponDiscount = couponApplied ? quote.couponDiscount : 0;

  return {
    productSnapshots: quotedSnapshots,
    grossSubtotal: quote.grossSubtotal,
    subtotal: quote.subtotal,
    totalTaxes: quote.totalTaxes,
    total: quote.total,
    couponValidation: couponApplied ? couponValidation : null,
    couponDiscount,
    couponExclusion: quote.coupon?.exclusionReason || null,
    promotionDiscount: quote.promotionDiscount,
    appliedPromotions: quote.appliedPromotions,
    promotionOutcome: {
      winner: quote.winner,
      exclusions: quote.exclusions,
      coupon: quote.coupon,
    },
    taxPolicyVersion: quote.taxPolicyVersion,
    finalTotal: quote.finalTotal,
    payment: normalizePayment(saleData.payment, quote.finalTotal)
  };
}

async function reserveInventory(items, companyId, userId, saleId, session, branchId) {
  if (await branchInventory.companyUsesBranchInventory(companyId, session)) {
    return branchInventory.consumeSaleItems({ items, companyId, branchId, actorId: userId, saleId }, session);
  }
  for (const item of items) {
    if (item.availableStock < item.quantity) {
      throw new Error(
        'Stock insuficiente para "' + item.priceSnapshot.name +
        '". Disponible: ' + item.availableStock
      );
    }

    let updated;
    if (item.variantId) {
      updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          company: companyId,
          disable: false,
          variants: {
            $elemMatch: { _id: item.variantId, active: true, stock: { $gte: item.quantity } }
          }
        },
        {
          $inc: { 'variants.$[variant].stock': -item.quantity },
          $set: { updated: true, updatedAt: new Date() }
        },
        {
          new: true,
          session,
          arrayFilters: [{ 'variant._id': item.variantId }]
        }
      );
    } else {
      updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          company: companyId,
          disable: false,
          stock: { $gte: item.quantity }
        },
        {
          $inc: { stock: -item.quantity },
          $set: { updated: true, updatedAt: new Date() }
        },
        { new: true, session }
      );
    }

    if (!updated) throw new Error('Stock changed for ' + item.priceSnapshot.name + '; retry the sale');

    await StockHistory.create([{
      product: item.productId,
      user: userId,
      type: 'reduce',
      quantity: item.quantity,
      previousStock: item.availableStock,
      newStock: item.availableStock - item.quantity,
      reason: 'Venta ' + saleId + (item.variantName ? ' / ' + item.variantName : '')
    }], { session });
  }
}

function buildCouponUsageFilter(couponId, saleId, customerId, companyId) {
  const usageConditions = [
    { 'usageHistory.saleId': { $ne: saleId } }
  ];
  if (customerId) {
    usageConditions.push({ usageHistory: { $not: { $elemMatch: { customerId } } } });
  }
  return {
    _id: couponId,
    company: companyId,
    disable: false,
    status: 'active',
    $and: usageConditions
  };
}

async function recordCouponUsage(prepared, sale, customerId, companyId, session) {
  if (!prepared.couponValidation) return;
  const result = await Coupon.updateOne(
    buildCouponUsageFilter(
      prepared.couponValidation.coupon.id,
      sale._id,
      customerId,
      companyId
    ),
    {
      $push: {
        usageHistory: {
          customerId: customerId || undefined,
          saleId: sale._id,
          discountApplied: prepared.couponDiscount,
          originalTotal: prepared.total,
          finalTotal: prepared.finalTotal,
          usedAt: new Date()
        }
      }
    },
    { session }
  );
  if (result.modifiedCount !== 1) throw new Error('Coupon could not be consumed');
}

async function createSaleMovement(sale, session) {
  await CashMovement.create([{
    movementNumber: 'SALE-' + sale._id,
    type: 'sale',
    amount: sale.finalTotal,
    concept: 'Venta ' + sale._id,
    description: 'Movimiento generado por checkout',
    paymentMethod: sale.payment.method,
    user: sale.createdBy,
    company: sale.company,
    branch: sale.branch,
    cashRegisterId: sale.cashRegisterId,
    cashRegister: sale.cashRegister,
    saleReference: sale._id,
    shift: sale.shift,
    authorized: true
  }], { session });
}

const ticketPaymentMethod = {
  cash: 'efectivo',
  card: 'tarjeta',
  transfer: 'transferencia',
  mixed: 'mixto'
};

async function createSaleTicket(sale, prepared, session) {
  const company = await Company.findById(sale.company).session(session).lean();
  const cashier = await User.findById(sale.createdBy).session(session).select('name lastNames userName').lean();
  const customer = sale.customer
    ? await Customer.findById(sale.customer).session(session).select('name').lean() : null;
  const address = company?.address
    ? [company.address.street, company.address.number?.ext, company.address.city]
      .filter(Boolean).join(', ')
    : '';

  await Ticket.create([{
    ticketNumber: 'SALE-' + sale._id,
    ticketType: 'sale',
    saleId: sale._id,
    company: sale.company,
    storeInfo: {
      name: company?.ticketStoreConfig?.name || company?.name || 'Mi Tienda',
      address: company?.ticketStoreConfig?.address || address,
      taxId: company?.ticketStoreConfig?.taxId || company?.rfc || '',
      phone: company?.ticketStoreConfig?.phone || company?.phone || '',
      email: company?.ticketStoreConfig?.email || company?.email || ''
    },
    transactionInfo: {
      date: sale.createdAt,
      branch: sale.branch,
      cashRegisterId: sale.cashRegisterId,
      cashRegister: sale.cashRegister,
      cashier: { id: sale.createdBy, name: [cashier?.name, cashier?.lastNames].filter(Boolean).join(' ') || cashier?.userName },
      customer: customer ? { id: customer._id, name: customer.name } : undefined
    },
    items: prepared.productSnapshots.map(item => ({
      productId: item.productId,
      productName: item.priceSnapshot.name,
      quantity: item.quantity,
      unitPrice: item.priceSnapshot.price,
      discount: item.discountAmount || 0,
      totalTaxes: item.taxAmount,
      totalPrice: item.total,
      variant: item.variantName ? { name: item.variantName } : undefined,
      taxes: item.priceSnapshot.taxExempt ? [] : [{
        name: 'Impuesto',
        type: 'percentage',
        rate: item.priceSnapshot.taxRate,
        amount: item.taxAmount
      }]
    })),
    totals: {
      subtotal: prepared.subtotal,
      totalTaxes: prepared.totalTaxes,
      discounts: prepared.promotionDiscount,
      promotionDiscount: prepared.promotionDiscount,
      couponDiscount: prepared.couponDiscount,
      couponCode: prepared.couponValidation?.coupon?.code,
      couponName: prepared.couponValidation?.coupon?.name,
      total: prepared.finalTotal
    },
    appliedPromotions: prepared.appliedPromotions,
    appliedCoupon: prepared.couponValidation ? {
      couponId: prepared.couponValidation.coupon.id,
      code: prepared.couponValidation.coupon.code,
      name: prepared.couponValidation.coupon.name,
      description: prepared.couponValidation.coupon.description,
      discountType: prepared.couponValidation.coupon.discountType,
      discountValue: prepared.couponValidation.coupon.discountValue,
      discountAmount: prepared.couponDiscount
    } : undefined,
    payment: {
      method: ticketPaymentMethod[sale.payment.method],
      details: {
        cashReceived: sale.payment.cashReceived,
        change: sale.payment.change,
        cashAmount: sale.payment.cashAmount,
        cardAmount: sale.payment.cardAmount,
        transferenceRef: sale.payment.reference
      }
    }
  }], { session });
}

async function addSell(sell, idempotencyKey) {
  if (!sell?.companyId || !sell?.createdBy) throw new Error('Sale tenant and cashier are required');
  if (!idempotencyKey) throw new Error('Idempotency key is required');

  const existing = await store.findByIdempotencyKey(idempotencyKey, sell.companyId);
  if (existing) return validateReplay(existing, sell);

  const session = await mongoose.startSession();
  let saleId;
  try {
    await session.withTransaction(async () => {
      const replay = await Sale.findOne({ company: sell.companyId, idempotencyKey }).session(session);
      if (replay) {
        saleId = validateReplay(replay, sell)._id;
        return;
      }
      const shift = await CashRegisterShift.findOneAndUpdate({
        _id: sell.shiftId,
        company: sell.companyId,
        cashRegister: sell.cashRegister,
        cashier: sell.createdBy,
        status: 'open',
        ...(sell.branchId ? { branch: sell.branchId } : {}),
        ...(sell.cashRegisterId ? { cashRegisterId: sell.cashRegisterId } : {})
      }, { $inc: { operationRevision: 1 } }, { new: true, session });
      if (!shift) throw Object.assign(new Error('No open shift exists for this cash register'), { status: 400 });

      if (sell.customerId) {
        const customer = await Customer.findOne({
          _id: sell.customerId,
          company: sell.companyId,
          disable: false
        }).session(session).select('_id');
        if (!customer) throw new Error('Customer not found in company');
      }

      const prepared = await prepareSale(sell, session);
      const sale = await store.add({
        idempotencyKey,
        requestFingerprint: requestFingerprint(sell),
        company: sell.companyId,
        branch: sell.branchId,
        cashRegisterId: sell.cashRegisterId,
        createdBy: sell.createdBy,
        customer: sell.customerId || undefined,
        cashRegister: sell.cashRegister,
        shift: shift._id,
        products: prepared.productSnapshots,
        grossSubtotal: prepared.grossSubtotal,
        subtotal: prepared.subtotal,
        totalTaxes: prepared.totalTaxes,
        total: prepared.total,
        couponCode: prepared.couponValidation?.coupon?.code,
        couponId: prepared.couponValidation?.coupon?.id,
        couponDiscount: prepared.couponDiscount,
        couponSnapshot: prepared.couponValidation ? {
          couponId: prepared.couponValidation.coupon.id,
          code: prepared.couponValidation.coupon.code,
          name: prepared.couponValidation.coupon.name,
          discountType: prepared.couponValidation.coupon.discountType,
          discountValue: prepared.couponValidation.coupon.discountValue,
          taxPolicyVersion: 'legacy_coupon_v1',
          discount: prepared.couponDiscount,
        } : undefined,
        promotionDiscount: prepared.promotionDiscount,
        appliedPromotions: prepared.appliedPromotions,
        promotionOutcome: prepared.promotionOutcome,
        taxPolicyVersion: prepared.taxPolicyVersion,
        finalTotal: prepared.finalTotal,
        payment: prepared.payment,
        change: prepared.payment.change,
        status: 'confirmed'
      }, session);

      await reserveInventory(
        prepared.productSnapshots,
        sell.companyId,
        sell.createdBy,
        sale._id,
        session,
        sell.branchId
      );
      await recordCouponUsage(prepared, sale, sell.customerId, sell.companyId, session);
      if (prepared.appliedPromotions.length > 0) {
        await promotionsController.recordRedemption({
          companyId: sell.companyId,
          sale,
          customerId: sell.customerId,
          branchId: sell.branchId,
          appliedPromotion: prepared.appliedPromotions[0],
        }, session);
      }
      await createSaleMovement(sale, session);
      await createSaleTicket(sale, prepared, session);
      saleId = sale._id;
    });
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = await store.findByIdempotencyKey(idempotencyKey, sell.companyId);
      if (duplicate) return validateReplay(duplicate, sell);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return Sale.findById(saleId);
}

async function processSaleWithCoupon(saleData) {
  const prepared = await prepareSale({
    ...saleData,
    payment: saleData.payment || { method: 'cash', cashReceived: Number.MAX_SAFE_INTEGER }
  });
  return {
    products: prepared.productSnapshots,
    grossSubtotal: prepared.grossSubtotal,
    subtotal: prepared.subtotal,
    totalTaxes: prepared.totalTaxes,
    total: prepared.total,
    couponCode: prepared.couponValidation?.coupon?.code || null,
    couponDiscount: prepared.couponDiscount,
    couponId: prepared.couponValidation?.coupon?.id || null,
    couponExclusion: prepared.couponExclusion,
    promotionDiscount: prepared.promotionDiscount,
    appliedPromotions: prepared.appliedPromotions,
    promotionOutcome: prepared.promotionOutcome,
    taxPolicyVersion: prepared.taxPolicyVersion,
    finalTotal: prepared.finalTotal
  };
}

async function validateCouponForSale(couponCode, companyId, products, customerId = null) {
  const snapshots = await createProductSnapshots(products, companyId);
  const totals = calculateSnapshotTotals(snapshots);
  return couponsController.validateCoupon(
    couponCode,
    companyId,
    { ...totals, products },
    customerId
  );
}

async function calculateSaleTaxesWithSnapshots(products, companyId) {
  const productSnapshots = await createProductSnapshots(products, companyId);
  return { ...calculateSnapshotTotals(productSnapshots), productSnapshots };
}

async function calculateSaleTaxes(products, companyId) {
  const result = await calculateSaleTaxesWithSnapshots(products, companyId);
  return { subtotal: result.subtotal, totalTaxes: result.totalTaxes, total: result.total };
}

async function getSaleHistoricalData(saleId, companyId) {
  const sale = await store.getSaleById(saleId, companyId);
  if (!sale) throw new Error('Sale not found');
  return {
    saleId: sale.id,
    date: sale.createdAt,
    total: sale.total,
    hasHistoricalData: sale.hasHistoricalData(),
    products: sale.getProductsWithHistoricalData()
  };
}

module.exports = {
  addSell,
  listSales: store.list,
  listSaleOperationsForReports: store.listSaleOperationsForReports,
  updateSell: (sellId, sell, companyId) => store.update(sellId, sell, companyId),
  removeSell: (sellId, companyId) => store.remove(sellId, companyId),
  calculateSaleTaxes,
  calculateSaleTaxesWithSnapshots,
  processSaleWithCoupon,
  validateCouponForSale,
  createProductSnapshots,
  getSaleHistoricalData,
  normalizePayment,
  calculateSnapshotTotals,
  buildCouponUsageFilter,
  applyPromotionQuoteToSnapshots,
  activePromotionsForCheckout,
  processSaleWithPromotions: processSaleWithCoupon
};
