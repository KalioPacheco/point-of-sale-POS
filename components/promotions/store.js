const { Promotion, PromotionRedemption } = require('./model');

function notFound(message = 'Promoción no encontrada') {
  const error = new Error(message);
  error.status = 404;
  return error;
}

async function add(data, companyId, actorId) {
  return Promotion.create({ ...data, company: companyId, createdBy: actorId, updatedBy: actorId });
}

async function get(promotionId, companyId) {
  const promotion = await Promotion.findOne({ _id: promotionId, company: companyId, disable: false });
  if (!promotion) throw notFound();
  return promotion;
}

async function list(companyId, filters = {}) {
  const query = { company: companyId, disable: false };
  if (filters.status) query.status = filters.status;
  if (filters.branchId) query.$or = [{ branches: { $size: 0 } }, { branches: filters.branchId }];
  if (filters.search) query.name = { $regex: String(filters.search), $options: 'i' };
  return Promotion.find(query).sort({ priority: -1, startsAt: 1, _id: 1 }).limit(Number(filters.limit) || 100).lean();
}

async function listActive(companyId, at = new Date(), session = null) {
  const query = Promotion.find({
    company: companyId,
    disable: false,
    status: 'active',
    startsAt: { $lte: at },
    endsAt: { $gte: at },
  }).sort({ priority: -1, _id: 1 });
  if (session) query.session(session);
  return query.lean();
}

async function update(promotionId, data, companyId, actorId) {
  const promotion = await get(promotionId, companyId);
  const protectedFields = ['company', 'createdBy', 'version', 'disable', '_id'];
  protectedFields.forEach(field => delete data[field]); // eslint-disable-line no-param-reassign
  Object.assign(promotion, data, { updatedBy: actorId, version: promotion.version + 1 });
  return promotion.save();
}

async function archive(promotionId, companyId, actorId) {
  const promotion = await get(promotionId, companyId);
  promotion.status = 'archived';
  promotion.disable = true;
  promotion.updatedBy = actorId;
  promotion.version += 1;
  return promotion.save();
}

function recordRedemption(data, session = null) {
  return session
    ? PromotionRedemption.create([data], { session })
    : PromotionRedemption.create([data]);
}

async function report(companyId, filters = {}) {
  const match = { company: require('mongoose').Types.ObjectId(companyId) }; // eslint-disable-line global-require
  if (filters.promotionId) match.promotion = require('mongoose').Types.ObjectId(filters.promotionId); // eslint-disable-line global-require
  if (filters.startDate || filters.endDate) {
    match.createdAt = {};
    if (filters.startDate) match.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) match.createdAt.$lte = new Date(filters.endDate);
  }
  const redemptions = await PromotionRedemption.find(match)
    .populate('promotion', 'name conditions benefit')
    .lean();
  const grouped = new Map();
  redemptions.forEach((redemption) => {
    const promotionId = String(redemption.promotion?._id || redemption.promotion);
    const current = grouped.get(promotionId) || {
      promotionId,
      name: redemption.promotion?.name || '',
      redemptions: 0,
      discount: 0,
      productIds: new Set(),
      categoryIds: new Set(),
    };
    current.redemptions += 1;
    current.discount += Number(redemption.discount || 0);
    (redemption.appliedSnapshot?.lineAllocations || []).forEach((line) => {
      if (line.productId) current.productIds.add(String(line.productId));
    });
    (redemption.promotion?.conditions || []).forEach((condition) => {
      (condition.productIds || []).forEach(productId => current.productIds.add(String(productId)));
      (condition.categoryIds || []).forEach(categoryId => current.categoryIds.add(String(categoryId)));
    });
    grouped.set(promotionId, current);
  });
  return [...grouped.values()]
    .map(row => ({
      promotionId: row.promotionId,
      name: row.name,
      redemptions: row.redemptions,
      discount: Math.round(row.discount * 100) / 100,
      productIds: [...row.productIds],
      categoryIds: [...row.categoryIds],
    }))
    .sort((left, right) => right.discount - left.discount || left.promotionId.localeCompare(right.promotionId));
}

module.exports = {
  add,
  get,
  list,
  listActive,
  update,
  archive,
  recordRedemption,
  report,
};
