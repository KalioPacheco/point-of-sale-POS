/* eslint-disable func-names */
/* eslint-disable no-lonely-if */
/* eslint-disable no-return-await */
const mongoose = require('mongoose');

const { Schema } = mongoose;

const couponUsageSchema = new Schema({
  customerId: {
    type: Schema.ObjectId,
    ref: 'Customers'
  },
  customerPhone: String,
  customerEmail: String,
  saleId: {
    type: Schema.ObjectId,
    ref: 'Sales',
    required: true
  },
  usedAt: {
    type: Date,
    default: Date.now
  },
  discountApplied: {
    type: Number,
    required: true
  },
  originalTotal: Number,
  finalTotal: Number
});

const couponSchema = new Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  discountType: {
    type: String,
    enum: ['percentage', 'fixed_amount'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  validFrom: { type: Date },
  expirationDate: {
    type: Date,
    required: true
  },
  minimumPurchase: {
    type: Number,
    default: 0
  },
  applicableProducts: [{
    type: Schema.ObjectId,
    ref: 'Products'
  }],
  applyToAllProducts: {
    type: Boolean,
    default: true
  },
  applicationMethods: {
    manualCode: {
      type: Boolean,
      default: true
    },
    barcode: {
      type: Boolean,
      default: false
    },
    cashierSelection: {
      type: Boolean,
      default: true
    }
  },

  usageHistory: [couponUsageSchema],

  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active'
  },
  company: {
    type: Schema.ObjectId,
    ref: 'Companies',
    required: true
  },
  createdBy: {
    type: Schema.ObjectId,
    ref: 'Users'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,
  disable: {
    type: Boolean,
    default: false
  }
});


couponSchema.statics.generateCode = function generateCode(prefix = 'COUP') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}${timestamp}${random}`.toUpperCase();
};

couponSchema.statics.findValidCoupon = async function findValidCoupon(code, companyId, session = null) {
  const now = new Date();
  
  const query = this.findOne({
    code: code.toUpperCase(),
    company: companyId,
    disable: false,
    status: 'active',
    $or: [{ validFrom: { $lte: now } }, { validFrom: { $exists: false } }],
    expirationDate: { $gte: now }
  });
  if (session) query.session(session);
  return query;
};

couponSchema.methods.isValidForSale = function isValidForSale(saleData, customerId = null) {
  const now = new Date();
  const errors = [];
  
  if (this.disable || this.status !== 'active') {
    errors.push('El cupón no está activo');
  }

  if (this.validFrom && now < this.validFrom) errors.push('El cupón aún no está vigente');

  if (now > this.expirationDate) {
    errors.push('El cupón ha expirado');
  }
  
  if (this.minimumPurchase > 0 && saleData.subtotal < this.minimumPurchase) {
    errors.push(`Compra mínima requerida: $${this.minimumPurchase}`);
  }

  if (customerId) {
    const customerUsage = this.usageHistory.filter(
      usage => usage.customerId && usage.customerId.toString() === customerId.toString()
    );
    
    if (customerUsage.length > 0) {
      errors.push('Ya has usado este cupón anteriormente');
    }
  }

  if (!this.applyToAllProducts && saleData.products && this.applicableProducts.length > 0) {
    const hasValidProducts = saleData.products.some(product => 
      this.applicableProducts.some(id => id.toString() === product.productId.toString())
    );
    
    if (!hasValidProducts) {
      errors.push('El cupón no es válido para los productos seleccionados');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

couponSchema.methods.calculateDiscount = function calculateDiscount(saleData) {
  let applicableAmount = 0;
  
  if (this.applyToAllProducts) {
    applicableAmount = saleData.subtotal;
  } else {
  
    if (saleData.products && this.applicableProducts.length > 0) {
      applicableAmount = saleData.products
        .filter(product => 
          this.applicableProducts.some(id => id.toString() === product.productId.toString())
        )
        .reduce((sum, product) => sum + (product.price * product.quantity), 0);
    }
  }
  
  let discount = 0;
  
  if (this.discountType === 'percentage') {
    discount = (applicableAmount * this.discountValue) / 100;
  } else if (this.discountType === 'fixed_amount') {
    discount = Math.min(this.discountValue, applicableAmount);
  }
  
  return {
    applicableAmount,
    discountAmount: Math.round(discount * 100) / 100,
    finalAmount: applicableAmount - discount
  };
};

couponSchema.methods.recordUsage = async function recordUsage(saleData, customerId = null) {
  const discountCalculation = this.calculateDiscount(saleData);
  
  const usage = {
    customerId,
    customerPhone: saleData.customerPhone,
    customerEmail: saleData.customerEmail,
    saleId: saleData.saleId,
    discountApplied: discountCalculation.discountAmount,
    originalTotal: saleData.total,
    finalTotal: saleData.total - discountCalculation.discountAmount
  };
  
  this.usageHistory.push(usage);
  this.updatedAt = new Date();
  
  return await this.save();
};

couponSchema.pre('validate', function(next) {
  if (this.validFrom && this.expirationDate && this.validFrom > this.expirationDate) {
    this.invalidate('validFrom', 'Fecha inicial debe ser anterior o igual al fin');
  }
  next();
});

couponSchema.pre('save', function(next) {
  if (new Date() > this.expirationDate && this.status === 'active') {
    this.status = 'expired';
  }
  
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  
  next();
});

couponSchema.index({ code: 1, company: 1 }, { unique: true });
couponSchema.index({ company: 1, status: 1 });
couponSchema.index({ expirationDate: 1 });
couponSchema.index({ 'usageHistory.customerId': 1 });

const model = mongoose.model('Coupons', couponSchema, 'coupons');
module.exports = model;
