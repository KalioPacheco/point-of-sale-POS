const mongoose = require('mongoose');

const { Schema } = mongoose;

const audienceSchema = new Schema({
  type: { type: String, enum: ['all', 'customers'], default: 'all' },
  customerIds: [{ type: Schema.ObjectId, ref: 'Customers' }],
}, { _id: false });

const conditionSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['minimum_purchase', 'minimum_quantity', 'products', 'categories'],
  },
  amount: { type: Number, min: 0 },
  quantity: { type: Number, min: 0 },
  productIds: [{ type: Schema.ObjectId, ref: 'Products' }],
  categoryIds: [{ type: Schema.ObjectId, ref: 'Categories' }],
}, { _id: false });

const benefitSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['percentage', 'fixed_amount', 'quantity_price', 'buy_x_get_y'],
  },
  // `line` applies only to the matching lines.  Cart discounts are still
  // allocated to lines by the evaluator before tax is calculated.
  scope: { type: String, enum: ['line', 'cart'], default: 'line' },
  value: { type: Number, min: 0 },
  quantity: { type: Number, min: 1 },
  bundlePrice: { type: Number, min: 0 },
  buyQuantity: { type: Number, min: 1 },
  getQuantity: { type: Number, min: 1 },
}, { _id: false });

const promotionSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000 },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'archived'],
    default: 'draft',
    index: true,
  },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  priority: { type: Number, default: 0, index: true },
  branches: [{ type: Schema.ObjectId, ref: 'Branches' }],
  audience: { type: audienceSchema, default: () => ({ type: 'all' }) },
  conditions: { type: [conditionSchema], default: [] },
  benefit: { type: benefitSchema, required: true },
  taxPolicyVersion: { type: String, default: 'promotion_v1_before_tax', maxlength: 80 },
  version: { type: Number, required: true, min: 1, default: 1 },
  createdBy: { type: Schema.ObjectId, ref: 'Users', required: true },
  updatedBy: { type: Schema.ObjectId, ref: 'Users' },
  disable: { type: Boolean, default: false },
}, { timestamps: true });

promotionSchema.pre('validate', function validatePromotion(next) {
  if (this.startsAt && this.endsAt && this.startsAt > this.endsAt) {
    this.invalidate('endsAt', 'La vigencia final debe ser posterior al inicio');
  }
  const benefit = this.benefit || {};
  if (benefit.type === 'percentage' && (benefit.value == null || benefit.value <= 0 || benefit.value > 100)) {
    this.invalidate('benefit.value', 'El porcentaje debe ser mayor a 0 y no exceder 100');
  }
  if (benefit.type === 'fixed_amount' && (benefit.value == null || benefit.value <= 0)) {
    this.invalidate('benefit.value', 'El descuento fijo debe ser mayor a 0');
  }
  if (benefit.type === 'quantity_price' && (benefit.quantity == null || benefit.bundlePrice == null)) {
    this.invalidate('benefit', 'El precio por cantidad requiere cantidad y precio de paquete');
  }
  if (benefit.type === 'buy_x_get_y' && (benefit.buyQuantity == null || benefit.getQuantity == null)) {
    this.invalidate('benefit', 'buy_x_get_y requiere buyQuantity y getQuantity');
  }
  this.conditions.forEach((condition) => {
    if (condition.type === 'minimum_purchase' && condition.amount == null) {
      this.invalidate('conditions', 'La compra mínima requiere amount');
    }
    if (condition.type === 'minimum_quantity' && condition.quantity == null) {
      this.invalidate('conditions', 'La cantidad mínima requiere quantity');
    }
    if (condition.type === 'products' && condition.productIds.length === 0) {
      this.invalidate('conditions', 'La condición de productos requiere productIds');
    }
    if (condition.type === 'categories' && condition.categoryIds.length === 0) {
      this.invalidate('conditions', 'La condición de categorías requiere categoryIds');
    }
  });
  next();
});

promotionSchema.index({ company: 1, status: 1, startsAt: 1, endsAt: 1, priority: -1 });
promotionSchema.index({ company: 1, branches: 1, status: 1 });

const promotionRedemptionSchema = new Schema({
  company: { type: Schema.ObjectId, ref: 'Companies', required: true, index: true },
  promotion: { type: Schema.ObjectId, ref: 'Promotions', required: true, index: true },
  sale: { type: Schema.ObjectId, ref: 'Sales', required: true, index: true },
  customer: { type: Schema.ObjectId, ref: 'Customers' },
  branch: { type: Schema.ObjectId, ref: 'Branches' },
  appliedSnapshot: { type: Schema.Types.Mixed, required: true },
  discount: { type: Number, required: true, min: 0 },
  taxPolicyVersion: { type: String, required: true, maxlength: 80 },
}, { timestamps: true });

promotionRedemptionSchema.index({ company: 1, promotion: 1, sale: 1 }, { unique: true });
promotionRedemptionSchema.index({ company: 1, createdAt: -1 });

module.exports = {
  Promotion: mongoose.model('Promotions', promotionSchema, 'promotions'),
  PromotionRedemption: mongoose.model('PromotionRedemptions', promotionRedemptionSchema, 'promotionRedemptions'),
};
