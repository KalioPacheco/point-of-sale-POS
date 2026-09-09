const store = require('./store');

module.exports = {
  createReceipt: (input, companyId, userId, idempotencyKey) => store.createReceipt(input, companyId, userId, idempotencyKey),
  approveReceipt: (receiptId, companyId, userId, approvalNote) => store.approveReceipt(receiptId, companyId, userId, approvalNote),
  listReceipts: (companyId, filters) => store.listReceipts(companyId, filters),
  createPhysicalCount: (input, companyId, userId, idempotencyKey) => store.createPhysicalCount(input, companyId, userId, idempotencyKey),
  approvePhysicalCount: (countId, companyId, userId, approvalNote) => store.approvePhysicalCount(countId, companyId, userId, approvalNote),
  listPhysicalCounts: (companyId, filters) => store.listPhysicalCounts(companyId, filters),
  createAdjustment: (input, companyId, userId, idempotencyKey) => store.createAdjustment(input, companyId, userId, idempotencyKey),
  approveAdjustment: (adjustmentId, companyId, userId, approvalNote) => store.approveAdjustment(adjustmentId, companyId, userId, approvalNote),
  listAdjustments: (companyId, filters) => store.listAdjustments(companyId, filters),
  reorderReport: (companyId, filters) => store.reorderReport(companyId, filters),
  getLevels: (companyId, filters) => store.getLevels(companyId, filters),
  createTransfer: (input, companyId, userId, idempotencyKey) => store.createTransfer(input, companyId, userId, idempotencyKey),
  transitionTransfer: (transferId, companyId, actor, action) => store.transitionTransfer(transferId, companyId, actor, action),
  listTransfers: (companyId, filters) => store.listTransfers(companyId, filters),
  companyUsesBranchInventory: companyId => store.companyUsesBranchInventory(companyId),
};
