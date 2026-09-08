const mongoose = require('mongoose');

const { Schema } = mongoose;

const receiptItemSchema = new Schema({
  product: { type: Schema.ObjectId, ref: 'Products', required: true },
  nameSnapshot: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.000001 },
  unitCost: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
  previousStock: Number,
  newStock: Number,
  previousCost: Number,
  newCost: Number,
  variantId: { type: Schema.ObjectId },
}, { _id: false });

const countItemSchema = new Schema({
  product: { type: Schema.ObjectId, ref: 'Products', required: true },
  nameSnapshot: { type: String, required: true },
  countedQuantity: { type: Number, required: true, min: 0 },
  previousStock: Number,
  difference: Number,
  variantId: { type: Schema.ObjectId },
  expectedVersion: { type: Number, min: 0 },
}, { _id: false });

const purchaseReceiptSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  branch: { type: Schema.ObjectId, ref: 'Branches', index: true },
  supplier: { type: Schema.ObjectId, ref: 'Suppliers', required: true },
  reference: { type: String, required: true, trim: true, maxlength: 120 },
  receivedAt: { type: Date, default: Date.now },
  items: { type: [receiptItemSchema], validate: value => Array.isArray(value) && value.length > 0 },
  totals: {
    quantity: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
  },
  notes: { type: String, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['pending', 'processing', 'approved', 'cancelled'], default: 'pending', index: true },
  createdBy: { type: Schema.ObjectId, ref: 'Users', required: true },
  approvedBy: { type: Schema.ObjectId, ref: 'Users' },
  approvedAt: Date,
  approvalNote: { type: String, trim: true, maxlength: 1000 },
  idempotencyKey: { type: String, trim: true, maxlength: 200 },
  requestFingerprint: { type: String, maxlength: 128 },
}, { timestamps: true });

purchaseReceiptSchema.index(
  { company: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
purchaseReceiptSchema.index({ company: 1, status: 1, receivedAt: -1 });
purchaseReceiptSchema.index({ company: 1, supplier: 1, reference: 1 }, { unique: true });

const physicalCountSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  branch: { type: Schema.ObjectId, ref: 'Branches', index: true },
  reference: { type: String, required: true, trim: true, maxlength: 120 },
  countedAt: { type: Date, default: Date.now },
  items: { type: [countItemSchema], validate: value => Array.isArray(value) && value.length > 0 },
  notes: { type: String, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['pending', 'processing', 'approved', 'cancelled'], default: 'pending', index: true },
  createdBy: { type: Schema.ObjectId, ref: 'Users', required: true },
  approvedBy: { type: Schema.ObjectId, ref: 'Users' },
  approvedAt: Date,
  approvalNote: { type: String, trim: true, maxlength: 1000 },
  idempotencyKey: { type: String, trim: true, maxlength: 200 },
  requestFingerprint: { type: String, maxlength: 128 },
}, { timestamps: true });

physicalCountSchema.index({ company: 1, status: 1, countedAt: -1 });
physicalCountSchema.index(
  { company: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

const adjustmentSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  branch: { type: Schema.ObjectId, ref: 'Branches', index: true },
  product: { type: Schema.ObjectId, ref: 'Products', required: true },
  variantId: { type: Schema.ObjectId },
  productNameSnapshot: { type: String, required: true },
  type: { type: String, enum: ['increase', 'decrease', 'set'], required: true },
  quantity: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'processing', 'approved', 'cancelled'], default: 'pending', index: true },
  requestedBy: { type: Schema.ObjectId, ref: 'Users', required: true },
  approvedBy: { type: Schema.ObjectId, ref: 'Users' },
  approvedAt: Date,
  approvalNote: { type: String, trim: true, maxlength: 1000 },
  previousStock: Number,
  newStock: Number,
  expectedVersion: { type: Number, min: 0 },
  idempotencyKey: { type: String, trim: true, maxlength: 200 },
  requestFingerprint: { type: String, maxlength: 128 },
}, { timestamps: true });

adjustmentSchema.index({ company: 1, status: 1, createdAt: -1 });
adjustmentSchema.index({ company: 1, product: 1, createdAt: -1 });
adjustmentSchema.index(
  { company: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

const inventoryLevelSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  branch: { type: Schema.ObjectId, ref: 'Branches', required: true, index: true },
  product: { type: Schema.ObjectId, ref: 'Products', required: true, index: true },
  variantId: { type: Schema.ObjectId },
  onHand: { type: Number, required: true, default: 0, min: 0 },
  // Reservations are only used for approved stock transfers. They are not an
  // e-commerce reservation mechanism and are released when the transfer ships.
  reserved: { type: Number, required: true, default: 0, min: 0 },
  reorderPoint: { type: Number, required: true, default: 0, min: 0 },
  version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });

// A normal compound unique index treats a missing variantId as the parent
// position and an ObjectId as a variant position. This preserves one parent
// balance plus one balance per variant without MongoDB's unsupported
// partial-filter form { variantId: { $exists: false } }.
inventoryLevelSchema.index(
  { company: 1, branch: 1, product: 1, variantId: 1 },
  { unique: true, name: 'inventory_level_unique_position_v2' }
);
inventoryLevelSchema.index({ company: 1, branch: 1, onHand: 1 });

const inventoryMovementSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  branch: { type: Schema.ObjectId, ref: 'Branches', required: true, index: true },
  product: { type: Schema.ObjectId, ref: 'Products', required: true, index: true },
  variantId: { type: Schema.ObjectId },
  type: {
    type: String,
    required: true,
    enum: [
      'opening_balance', 'receipt', 'physical_count', 'adjustment', 'sale', 'refund',
      'transfer_approved', 'transfer_dispatched', 'transfer_received', 'transfer_cancelled'
    ],
  },
  quantity: { type: Number, required: true },
  before: { type: Number, required: true, min: 0 },
  after: { type: Number, required: true, min: 0 },
  reservedBefore: { type: Number, required: true, default: 0, min: 0 },
  reservedAfter: { type: Number, required: true, default: 0, min: 0 },
  version: { type: Number, required: true, min: 0 },
  sourceType: { type: String, required: true, maxlength: 80 },
  sourceId: { type: Schema.ObjectId, required: true },
  // Opening balances predate a real actor; all operational movements require one.
  actor: { type: Schema.ObjectId, ref: 'Users' },
  idempotencyKey: { type: String, trim: true, maxlength: 200 },
}, { timestamps: true });

inventoryMovementSchema.index({ company: 1, branch: 1, product: 1, createdAt: -1, _id: -1 });
inventoryMovementSchema.index(
  { company: 1, sourceType: 1, sourceId: 1, product: 1, variantId: 1, type: 1 },
  { unique: true }
);

const transferItemSchema = new Schema({
  product: { type: Schema.ObjectId, ref: 'Products', required: true },
  variantId: { type: Schema.ObjectId },
  nameSnapshot: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.000001 },
}, { _id: false });

const stockTransferSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  originBranch: { type: Schema.ObjectId, ref: 'Branches', required: true, index: true },
  destinationBranch: { type: Schema.ObjectId, ref: 'Branches', required: true, index: true },
  items: { type: [transferItemSchema], validate: value => Array.isArray(value) && value.length > 0 },
  reason: { type: String, trim: true, maxlength: 1000 },
  status: {
    type: String,
    enum: ['requested', 'approved', 'in_transit', 'received', 'cancelled'],
    default: 'requested',
    index: true,
  },
  requestedBy: { type: Schema.ObjectId, ref: 'Users', required: true },
  approvedBy: { type: Schema.ObjectId, ref: 'Users' },
  approvedAt: Date,
  selfApproved: { type: Boolean, default: false },
  dispatchedBy: { type: Schema.ObjectId, ref: 'Users' },
  dispatchedAt: Date,
  receivedBy: { type: Schema.ObjectId, ref: 'Users' },
  receivedAt: Date,
  cancelledBy: { type: Schema.ObjectId, ref: 'Users' },
  cancelledAt: Date,
  cancellationReason: { type: String, trim: true, maxlength: 1000 },
  idempotencyKey: { type: String, trim: true, maxlength: 200 },
  requestFingerprint: { type: String, maxlength: 128 },
}, { timestamps: true });

stockTransferSchema.index(
  { company: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
stockTransferSchema.index({ company: 1, originBranch: 1, status: 1, createdAt: -1 });
stockTransferSchema.index({ company: 1, destinationBranch: 1, status: 1, createdAt: -1 });

module.exports = {
  PurchaseReceipt: mongoose.model('PurchaseReceipt', purchaseReceiptSchema, 'purchaseReceipts'),
  PhysicalCount: mongoose.model('PhysicalCount', physicalCountSchema, 'physicalCounts'),
  InventoryAdjustment: mongoose.model('InventoryAdjustment', adjustmentSchema, 'inventoryAdjustments'),
  InventoryLevel: mongoose.model('InventoryLevel', inventoryLevelSchema, 'inventoryLevels'),
  InventoryMovement: mongoose.model('InventoryMovement', inventoryMovementSchema, 'inventoryMovements'),
  StockTransfer: mongoose.model('StockTransfer', stockTransferSchema, 'stockTransfers'),
};
