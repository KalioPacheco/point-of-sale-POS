/*
 * Promotion V1 evaluator.
 *
 * This module deliberately has no database dependencies.  Both the simulator
 * and checkout give it authoritative product snapshots, which makes the quote
 * reproducible and prevents a browser from choosing a price or discount.
 */

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const toCents = value => Math.round((Number(value) + Number.EPSILON) * 100);
const fromCents = value => roundMoney(Number(value || 0) / 100);

const id = value => String(value?._id || value?.id || value || '');
const array = value => (Array.isArray(value) ? value : (value == null ? [] : [value]));

function plain(value) {
  if (value && typeof value.toObject === 'function') return value.toObject();
  return value || {};
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueIds(values) {
  return [...new Set(values.map(id).filter(Boolean))];
}

function valuesFrom(value, keys) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return [value];
  return keys.flatMap(key => array(value[key]));
}

function normalizeItems(items = []) {
  return items.map((raw, index) => {
    const item = plain(raw);
    const snapshot = plain(item.priceSnapshot);
    const quantity = numeric(item.quantity, 0);
    const unitPrice = roundMoney(item.unitPrice ?? item.price ?? snapshot.price ?? 0);
    const categories = uniqueIds([
      ...array(item.categoryIds),
      ...array(item.categories),
      ...array(snapshot.categoryIds),
      ...array(snapshot.categories),
      ...array(snapshot.categoryId),
    ]);
    const grossSubtotal = toCents(unitPrice * quantity);
    return {
      index,
      productId: id(item.productId || item.product),
      variantId: id(item.variantId),
      quantity,
      unitPrice,
      unitPriceCents: toCents(unitPrice),
      grossSubtotal,
      taxRate: numeric(item.taxRate ?? snapshot.taxRate, 0),
      taxExempt: Boolean(item.taxExempt ?? snapshot.taxExempt),
      categories,
    };
  }).filter(item => item.productId && item.quantity > 0 && item.unitPriceCents >= 0);
}

function normalizeConditions(promotion) {
  const source = plain(promotion);
  const result = {
    minimumPurchase: numeric(source.minimumPurchase ?? source.minimumAmount, 0),
    minimumQuantity: numeric(source.minimumQuantity, 0),
    productIds: uniqueIds([
      ...valuesFrom(source.eligibleProducts, ['productIds', 'products', 'ids', 'value']),
      ...valuesFrom(source.productIds, ['productIds', 'products', 'ids', 'value']),
      ...valuesFrom(source.products, ['productIds', 'products', 'ids', 'value']),
    ]),
    categoryIds: uniqueIds([
      ...valuesFrom(source.eligibleCategories, ['categoryIds', 'categories', 'ids', 'value']),
      ...valuesFrom(source.categoryIds, ['categoryIds', 'categories', 'ids', 'value']),
      ...valuesFrom(source.categories, ['categoryIds', 'categories', 'ids', 'value']),
    ]),
  };

  const conditions = Array.isArray(source.conditions)
    ? source.conditions
    : (source.conditions && typeof source.conditions === 'object' ? [source.conditions] : []);

  conditions.forEach((raw) => {
    const condition = plain(raw);
    const type = String(condition.type || condition.kind || '').trim().toLowerCase();
    if (type === 'minimum_purchase' || type === 'minimum_amount' || type === 'min_subtotal') {
      result.minimumPurchase = Math.max(result.minimumPurchase, numeric(
        condition.amount ?? condition.value ?? condition.minimumPurchase,
        0,
      ));
    } else if (type === 'minimum_quantity' || type === 'min_quantity') {
      result.minimumQuantity = Math.max(result.minimumQuantity, numeric(
        condition.quantity ?? condition.value ?? condition.minimumQuantity,
        0,
      ));
    } else if (type === 'products' || type === 'product_ids' || type === 'product') {
      result.productIds = uniqueIds([
        ...result.productIds,
        ...valuesFrom(condition, ['productIds', 'products', 'productIds', 'ids', 'value', 'productId']),
      ]);
    } else if (type === 'categories' || type === 'category_ids' || type === 'category') {
      result.categoryIds = uniqueIds([
        ...result.categoryIds,
        ...valuesFrom(condition, ['categoryIds', 'categories', 'ids', 'value', 'categoryId']),
      ]);
    } else {
      result.minimumPurchase = Math.max(result.minimumPurchase, numeric(
        condition.minimumPurchase ?? condition.minimumAmount,
        0,
      ));
      result.minimumQuantity = Math.max(result.minimumQuantity, numeric(condition.minimumQuantity, 0));
      result.productIds = uniqueIds([
        ...result.productIds,
        ...valuesFrom(condition, ['productIds', 'eligibleProducts']),
      ]);
      result.categoryIds = uniqueIds([
        ...result.categoryIds,
        ...valuesFrom(condition, ['categoryIds', 'eligibleCategories']),
      ]);
    }
  });
  return result;
}

function normalizeBenefit(promotion) {
  const source = plain(promotion);
  const benefit = plain(source.benefit || source.discount || source);
  const rawType = String(
    benefit.type || benefit.kind || source.benefitType || source.discountType || '',
  ).trim().toLowerCase();
  const aliases = {
    percent: 'percentage',
    percentage_discount: 'percentage',
    product_percentage: 'percentage',
    cart_percentage: 'percentage',
    fixed: 'fixed_amount',
    amount: 'fixed_amount',
    fixed_discount: 'fixed_amount',
    cart_fixed_amount: 'fixed_amount',
    price_by_quantity: 'quantity_price',
    quantity_price: 'quantity_price',
    fixed_price: 'quantity_price',
    buyxgety: 'buy_x_get_y',
    buy_x_get_y: 'buy_x_get_y',
  };
  const type = aliases[rawType] || rawType;
  const scope = String(benefit.scope || source.scope || '').trim().toLowerCase();
  return {
    type,
    scope: scope || (rawType.startsWith('cart_') ? 'cart' : 'line'),
    value: numeric(benefit.value ?? benefit.amount ?? benefit.percent ?? benefit.percentage, 0),
    quantity: numeric(benefit.quantity ?? benefit.bundleQuantity ?? benefit.buyQuantity ?? benefit.buyX, 0),
    bundlePrice: numeric(benefit.bundlePrice ?? benefit.fixedPrice ?? benefit.price, 0),
    buyQuantity: numeric(benefit.buyQuantity ?? benefit.buyX, 0),
    getQuantity: numeric(benefit.getQuantity ?? benefit.getY, 0),
  };
}

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function audienceAllows(promotion, customerId) {
  const audience = plain(promotion.audience);
  const type = String(audience.type || audience.kind || promotion.audienceType || 'all').toLowerCase();
  if (type === 'all' || type === 'everyone' || type === 'any') return true;
  const selected = uniqueIds([
    ...array(audience.customerIds),
    ...array(audience.customers),
    ...array(promotion.customerIds),
  ]);
  return Boolean(customerId) && selected.includes(String(customerId));
}

function branchAllows(promotion, branchId) {
  const branches = uniqueIds([...array(promotion.branches), ...array(promotion.branchIds)]);
  return branches.length === 0 || (Boolean(branchId) && branches.includes(String(branchId)));
}

function allocateProportionally(totalCents, lines) {
  const allocation = new Map(lines.map(line => [line.index, 0]));
  const base = lines.reduce((sum, line) => sum + line.grossSubtotal, 0);
  const capped = Math.max(0, Math.min(totalCents, base));
  if (capped === 0 || base === 0) return allocation;
  let assigned = 0;
  const remainders = lines.map((line) => {
    const raw = (capped * line.grossSubtotal) / base;
    const cents = Math.floor(raw);
    assigned += cents;
    allocation.set(line.index, cents);
    return { index: line.index, remainder: raw - cents };
  });
  remainders.sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let cursor = 0; assigned < capped; cursor += 1) {
    const key = remainders[cursor % remainders.length].index;
    allocation.set(key, allocation.get(key) + 1);
    assigned += 1;
  }
  return allocation;
}

function calculateQuantityPrice(lines, benefit) {
  const allocation = new Map(lines.map(line => [line.index, 0]));
  const bundleQuantity = Math.floor(benefit.quantity);
  const bundlePrice = toCents(benefit.bundlePrice);
  if (bundleQuantity < 1 || bundlePrice < 0) return allocation;
  lines.forEach((line) => {
    const groups = Math.floor(line.quantity / bundleQuantity);
    const basePerBundle = line.unitPriceCents * bundleQuantity;
    const discount = Math.max(0, basePerBundle - bundlePrice) * groups;
    allocation.set(line.index, Math.min(discount, line.grossSubtotal));
  });
  return allocation;
}

function calculateBuyXGetY(lines, benefit) {
  const allocation = new Map(lines.map(line => [line.index, 0]));
  const buy = Math.floor(benefit.buyQuantity);
  const get = Math.floor(benefit.getQuantity);
  if (buy < 1 || get < 1) return allocation;
  const groups = new Map();
  lines.forEach((line) => {
    const key = `${line.productId}:${line.variantId}`;
    const current = groups.get(key) || { quantity: 0, lines: [] };
    current.quantity += line.quantity;
    current.lines.push(line);
    groups.set(key, current);
  });
  groups.forEach((group) => {
    const freeQuantity = Math.floor(group.quantity / (buy + get)) * get;
    if (freeQuantity <= 0) return;
    const desired = freeQuantity * group.lines[0].unitPriceCents;
    const split = allocateProportionally(desired, group.lines);
    group.lines.forEach(line => allocation.set(line.index, split.get(line.index)));
  });
  return allocation;
}

function calculateDiscount(lines, benefit) {
  const allocation = new Map(lines.map(line => [line.index, 0]));
  const base = lines.reduce((sum, line) => sum + line.grossSubtotal, 0);
  if (base <= 0) return allocation;

  if (benefit.type === 'percentage') {
    if (benefit.value <= 0) return allocation;
    lines.forEach((line) => {
      allocation.set(line.index, Math.min(line.grossSubtotal, Math.round((line.grossSubtotal * benefit.value) / 100)));
    });
    return allocation;
  }
  if (benefit.type === 'fixed_amount') return allocateProportionally(toCents(benefit.value), lines);
  if (benefit.type === 'quantity_price') return calculateQuantityPrice(lines, benefit);
  if (benefit.type === 'buy_x_get_y') return calculateBuyXGetY(lines, benefit);
  return allocation;
}

function serializable(value) {
  return JSON.parse(JSON.stringify(value, (_key, current) => {
    if (current && typeof current.toObject === 'function') return current.toObject();
    return current;
  }));
}

function assessPromotion(rawPromotion, context, items, grossSubtotal) {
  const promotion = plain(rawPromotion);
  const promotionId = id(promotion);
  const now = dateValue(context.now) ?? Date.now();
  if (context.companyId && promotion.company && id(promotion.company) !== String(context.companyId)) {
    return { promotionId, eligible: false, reason: 'TENANT_MISMATCH' };
  }
  if (String(promotion.status || '').toLowerCase() !== 'active') {
    return { promotionId, eligible: false, reason: 'PROMOTION_NOT_ACTIVE' };
  }
  const startsAt = dateValue(promotion.startsAt || promotion.validFrom);
  const endsAt = dateValue(promotion.endsAt || promotion.expirationDate);
  if (startsAt && now < startsAt) return { promotionId, eligible: false, reason: 'PROMOTION_NOT_STARTED' };
  if (endsAt && now > endsAt) return { promotionId, eligible: false, reason: 'PROMOTION_EXPIRED' };
  if (!branchAllows(promotion, context.branchId)) return { promotionId, eligible: false, reason: 'BRANCH_NOT_ELIGIBLE' };
  if (!audienceAllows(promotion, context.customerId)) return { promotionId, eligible: false, reason: 'CUSTOMER_NOT_ELIGIBLE' };

  const conditions = normalizeConditions(promotion);
  const eligibleLines = items.filter((item) => {
    const productMatches = conditions.productIds.length === 0 || conditions.productIds.includes(item.productId);
    const categoryMatches = conditions.categoryIds.length === 0
      || item.categories.some(categoryId => conditions.categoryIds.includes(categoryId));
    return productMatches && categoryMatches;
  });
  if (eligibleLines.length === 0) return { promotionId, eligible: false, reason: 'PRODUCTS_NOT_ELIGIBLE' };
  if (grossSubtotal < toCents(conditions.minimumPurchase)) {
    return { promotionId, eligible: false, reason: 'MINIMUM_PURCHASE_NOT_MET' };
  }
  const quantity = eligibleLines.reduce((sum, line) => sum + line.quantity, 0);
  if (quantity < conditions.minimumQuantity) return { promotionId, eligible: false, reason: 'MINIMUM_QUANTITY_NOT_MET' };

  const benefit = normalizeBenefit(promotion);
  const allocation = calculateDiscount(eligibleLines, benefit);
  const discountCents = [...allocation.values()].reduce((sum, value) => sum + value, 0);
  if (discountCents <= 0) return { promotionId, eligible: false, reason: 'BENEFIT_NOT_APPLICABLE' };

  return {
    promotionId,
    promotion,
    eligible: true,
    priority: numeric(promotion.priority, 0),
    benefit,
    allocation,
    discountCents,
    eligibleLineIndexes: eligibleLines.map(line => line.index),
  };
}

function buildLineAllocations(items, allocation, usePromotionTaxPolicy) {
  return items.map((item) => {
    const discountCents = allocation.get(item.index) || 0;
    const taxableSubtotalCents = Math.max(0, item.grossSubtotal - discountCents);
    const taxCents = usePromotionTaxPolicy && !item.taxExempt
      ? Math.round((taxableSubtotalCents * item.taxRate) / 100)
      : Math.round((item.grossSubtotal * (item.taxExempt ? 0 : item.taxRate)) / 100);
    return {
      lineIndex: item.index,
      productId: item.productId,
      variantId: item.variantId || null,
      quantity: item.quantity,
      grossSubtotal: fromCents(item.grossSubtotal),
      discount: fromCents(discountCents),
      taxableSubtotal: fromCents(taxableSubtotalCents),
      taxRate: item.taxExempt ? 0 : item.taxRate,
      taxAmount: fromCents(taxCents),
      total: fromCents(taxableSubtotalCents + taxCents),
    };
  });
}

/**
 * Evaluate automatic promotions and the optional legacy coupon.
 * Higher `priority` wins; equal priorities resolve to the larger customer
 * benefit and finally to the promotion id.  A valid automatic promotion is
 * intentionally exclusive with a manual coupon in V1.
 */
function evaluatePromotions(context = {}) {
  const items = normalizeItems(context.products || context.items || []);
  const grossSubtotalCents = items.reduce((sum, item) => sum + item.grossSubtotal, 0);
  const assessments = (context.promotions || []).map(promotion =>
    assessPromotion(promotion, context, items, grossSubtotalCents));
  const eligible = assessments.filter(assessment => assessment.eligible).sort((left, right) =>
    right.priority - left.priority
    || right.discountCents - left.discountCents
    || left.promotionId.localeCompare(right.promotionId));
  const winner = eligible[0] || null;
  const exclusions = assessments.map((assessment) => {
    if (!assessment.eligible) return assessment;
    if (winner && assessment.promotionId !== winner.promotionId) {
      return {
        promotionId: assessment.promotionId,
        eligible: true,
        reason: assessment.priority === winner.priority ? 'LOWER_BENEFIT' : 'LOWER_PRIORITY',
        discount: fromCents(assessment.discountCents),
      };
    }
    return { promotionId: assessment.promotionId, eligible: true, reason: 'APPLIED', discount: fromCents(assessment.discountCents) };
  });

  const emptyAllocation = new Map(items.map(item => [item.index, 0]));
  const coupon = plain(context.coupon);
  const couponDiscountCents = coupon.valid === false ? 0 : toCents(coupon.discountAmount ?? coupon.discount?.discountAmount ?? 0);
  const couponIsCandidate = couponDiscountCents > 0;
  const automaticDiscountCents = winner ? winner.discountCents : 0;
  const appliedCoupon = !winner && couponIsCandidate;
  const allocation = winner ? winner.allocation : emptyAllocation;
  const lineAllocations = buildLineAllocations(items, allocation, Boolean(winner));
  const subtotalCents = lineAllocations.reduce((sum, line) => sum + toCents(line.taxableSubtotal), 0);
  const taxesCents = lineAllocations.reduce((sum, line) => sum + toCents(line.taxAmount), 0);
  const totalBeforeCouponCents = subtotalCents + taxesCents;
  const finalTotalCents = Math.max(0, totalBeforeCouponCents - (appliedCoupon ? couponDiscountCents : 0));
  const appliedPromotions = winner ? [{
    promotionId: winner.promotionId,
    version: numeric(winner.promotion.version, 1),
    name: winner.promotion.name || '',
    priority: winner.priority,
    taxPolicyVersion: context.taxPolicyVersion || winner.promotion.taxPolicyVersion || 'promotion_v1_before_tax',
    benefit: serializable(winner.promotion.benefit || winner.benefit),
    conditions: serializable(winner.promotion.conditions || []),
    discount: fromCents(automaticDiscountCents),
    lineAllocations: lineAllocations.filter(line => line.discount > 0),
    cartAllocation: winner.benefit.scope === 'cart' ? fromCents(automaticDiscountCents) : 0,
  }] : [];

  return {
    taxPolicyVersion: winner ? (context.taxPolicyVersion || winner.promotion.taxPolicyVersion || 'promotion_v1_before_tax') : (context.taxPolicyVersion || 'legacy_coupon_v1'),
    grossSubtotal: fromCents(grossSubtotalCents),
    subtotal: fromCents(subtotalCents),
    totalTaxes: fromCents(taxesCents),
    total: fromCents(totalBeforeCouponCents),
    finalTotal: fromCents(finalTotalCents),
    discountTotal: fromCents(automaticDiscountCents + (appliedCoupon ? couponDiscountCents : 0)),
    promotionDiscount: fromCents(automaticDiscountCents),
    couponDiscount: fromCents(appliedCoupon ? couponDiscountCents : 0),
    appliedPromotions,
    lineAllocations,
    winner: winner ? {
      promotionId: winner.promotionId,
      name: winner.promotion.name || '',
      priority: winner.priority,
      discount: fromCents(automaticDiscountCents),
    } : null,
    coupon: couponIsCandidate ? {
      applied: appliedCoupon,
      exclusionReason: winner ? 'COUPON_NOT_STACKABLE_WITH_PROMOTION' : null,
      discount: fromCents(couponDiscountCents),
    } : null,
    exclusions,
  };
}

module.exports = {
  evaluatePromotions,
  normalizeBenefit,
  normalizeConditions,
  roundMoney,
};
