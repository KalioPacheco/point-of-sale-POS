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
}, { _id: false });

const countItemSchema = new Schema({
  product: { type: Schema.ObjectId, ref: 'Products', required: true },
  nameSnapshot: { type: String, required: true },
  countedQuantity: { type: Number, required: true, min: 0 },
  previousStock: Number,
  difference: Number,
}, { _id: false });

const purchaseReceiptSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
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
  reference: { type: String, required: true, trim: true, maxlength: 120 },
  countedAt: { type: Date, default: Date.now },
  items: { type: [countItemSchema], validate: value => Array.isArray(value) && value.length > 0 },
  notes: { type: String, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['pending', 'processing', 'approved', 'cancelled'], default: 'pending', index: true },
  createdBy: { type: Schema.ObjectId, ref: 'Users', required: true },
  approvedBy: { type: Schema.ObjectId, ref: 'Users' },
  approvedAt: Date,
  approvalNote: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true });

physicalCountSchema.index({ company: 1, status: 1, countedAt: -1 });

const adjustmentSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  product: { type: Schema.ObjectId, ref: 'Products', required: true },
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
}, { timestamps: true });

adjustmentSchema.index({ company: 1, status: 1, createdAt: -1 });
adjustmentSchema.index({ company: 1, product: 1, createdAt: -1 });

module.exports = {
  PurchaseReceipt: mongoose.model('PurchaseReceipt', purchaseReceiptSchema, 'purchaseReceipts'),
  PhysicalCount: mongoose.model('PhysicalCount', physicalCountSchema, 'physicalCounts'),
  InventoryAdjustment: mongoose.model('InventoryAdjustment', adjustmentSchema, 'inventoryAdjustments'),
};
