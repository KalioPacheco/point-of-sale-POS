const store = require('./store');

module.exports = {
  createReceipt: (input, companyId, userId, idempotencyKey) => store.createReceipt(input, companyId, userId, idempotencyKey),
  approveReceipt: (receiptId, companyId, userId, approvalNote) => store.approveReceipt(receiptId, companyId, userId, approvalNote),
  listReceipts: (companyId, filters) => store.listReceipts(companyId, filters),
  createPhysicalCount: (input, companyId, userId) => store.createPhysicalCount(input, companyId, userId),
  approvePhysicalCount: (countId, companyId, userId, approvalNote) => store.approvePhysicalCount(countId, companyId, userId, approvalNote),
  listPhysicalCounts: (companyId, filters) => store.listPhysicalCounts(companyId, filters),
  createAdjustment: (input, companyId, userId) => store.createAdjustment(input, companyId, userId),
  approveAdjustment: (adjustmentId, companyId, userId, approvalNote) => store.approveAdjustment(adjustmentId, companyId, userId, approvalNote),
  listAdjustments: (companyId, filters) => store.listAdjustments(companyId, filters),
  reorderReport: companyId => store.reorderReport(companyId),
};
