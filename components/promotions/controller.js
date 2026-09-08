const store = require('./store');
const { evaluatePromotions } = require('./evaluator');

function add(data, companyId, actorId) {
  if (!companyId || !actorId) throw new Error('Empresa y usuario autenticado son requeridos');
  return store.add(data, companyId, actorId);
}

function update(promotionId, data, companyId, actorId) {
  if (!promotionId) throw new Error('Promoción requerida');
  return store.update(promotionId, { ...data }, companyId, actorId);
}

function quote(context) {
  return evaluatePromotions(context);
}

async function recordRedemption({ companyId, sale, customerId, branchId, appliedPromotion }, session) {
  if (!appliedPromotion?.promotionId || !sale?._id) return null;
  const [redemption] = await store.recordRedemption({
    company: companyId,
    promotion: appliedPromotion.promotionId,
    sale: sale._id,
    customer: customerId || undefined,
    branch: branchId || undefined,
    appliedSnapshot: appliedPromotion,
    discount: appliedPromotion.discount,
    taxPolicyVersion: appliedPromotion.taxPolicyVersion,
  }, session);
  return redemption;
}

module.exports = {
  add,
  get: store.get,
  list: store.list,
  update,
  archive: store.archive,
  listActive: store.listActive,
  report: store.report,
  quote,
  recordRedemption,
};
