/* eslint-disable no-return-await */
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Esquema de uso de cupones 
const couponUsageSchema = new Schema({
  customerId: {
    type: Schema.ObjectId,
    ref: 'Customers'
  },
  customerPhone: String,
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

// modelo de cupon inicia aqui el principalm 
const couponSchema = new Schema({

  code: {
    type: String,
    required: true,
    unique: true,
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

  maxDiscountAmount: {
    type: Number,
    default: null
  },
  
  startDate: {
    type: Date,
    default: Date.now
  },
  expirationDate: {
    type: Date,
    required: true
  },

  usageLimit: {
    type: Number,
    default: null 
  },
  usagePerCustomer: {
    type: Number,
    default: 1
  },
  currentUsage: {
    type: Number,
    default: 0
  },

  minimumPurchase: {
    type: Number,
    default: 0
  },
  
 
  applicableProducts: [{
    type: Schema.ObjectId,
    ref: 'Products'
  }],
  applicableCategories: [{
    type: Schema.ObjectId,
    ref: 'Categories'
  }],
  excludedProducts: [{
    type: Schema.ObjectId,
    ref: 'Products'
  }],
 
  applyToAllProducts: {
    type: Boolean,
    default: true
  },
  
  
  applyBeforeTax: {
    type: Boolean,
    default: true
  },
  // Se puede combinar con otros cupones
  combinable: {
    type: Boolean,
    default: false
  },
  
  // metodo de aplicar codigo son tres primero ingresa el codigo segundo codigo de barras y tercerp lo aplican manualmente 
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
  },

  usageHistory: [couponUsageSchema],
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired', 'depleted'],
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


// Generar código único para cupón
couponSchema.statics.generateCode = function generateCode(prefix = 'COUP') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}${random}`.toUpperCase();
};

couponSchema.statics.findValidCoupon = async function findValidCoupon(code, companyId) {
  const now = new Date();
  
  return await this.findOne({
    code: code.toUpperCase(),
    company: companyId,
    disable: false,
    status: 'active',
    startDate: { $lte: now },
    expirationDate: { $gte: now },
    $or: [
      { usageLimit: null },
      { $expr: { $lt: ['$currentUsage', '$usageLimit'] } }
    ]
  });
};


// Verificar si el cupón es válido para una venta específica
couponSchema.methods.isValidForSale = function isValidForSale(saleData, customerId = null) {
  const now = new Date();
  const errors = [];

  if (this.disable || this.status !== 'active') {
    errors.push('El cupón no está activo');
  }
  if (now < this.startDate) {
    errors.push('El cupón aún no es válido');
  }
  if (now > this.expirationDate) {
    errors.push('El cupón ha expirado');
  }
  
  // Verificar límite de uso general
  if (this.usageLimit && this.currentUsage >= this.usageLimit) {
    errors.push('El cupón ha alcanzado su límite de uso');
  }
  
  // Verificar uso por cliente
  if (customerId && this.usagePerCustomer) {
    const customerUsage = this.usageHistory.filter(
      usage => usage.customerId && usage.customerId.toString() === customerId.toString()
    ).length;
    
    if (customerUsage >= this.usagePerCustomer) {
      errors.push('Has alcanzado el límite de uso de este cupón');
    }
  }

  if (this.minimumPurchase > 0 && saleData.subtotal < this.minimumPurchase) {
    errors.push(`Compra mínima requerida: $${this.minimumPurchase}`);
  }
  
  if (!this.applyToAllProducts && saleData.products) {
    const hasValidProducts = saleData.products.some(product => 
      this.isValidForProduct(product.productId)
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

// Verificar si el cupón es válido para un producto específico
couponSchema.methods.isValidForProduct = function isValidForProduct(productId) {
  if (this.applyToAllProducts) {
    return !this.excludedProducts.some(id => id.toString() === productId.toString());
  }
  
  // Si tiene productos específicos, verificar que esté incluido
  
  if (this.applicableProducts.length > 0) {
    return this.applicableProducts.some(id => id.toString() === productId.toString());
  }
  return false;
};

// Calcular el descuento para una venta
couponSchema.methods.calculateDiscount = function calculateDiscount(saleData) {
  let applicableAmount = 0;
  
  if (this.applyToAllProducts) {
    // Aplicar a toda la venta (menos productos excluidos)
    applicableAmount = saleData.subtotal;
    
    if (this.excludedProducts.length > 0 && saleData.products) {
      const excludedAmount = saleData.products
        .filter(product => this.excludedProducts.some(id => 
          id.toString() === product.productId.toString()
        ))
        .reduce((sum, product) => sum + (product.price * product.quantity), 0);
      
      applicableAmount -= excludedAmount;
    }
  } else {
    // Aplicar solo a productos específicos
    if (saleData.products) {
      applicableAmount = saleData.products
        .filter(product => this.isValidForProduct(product.productId))
        .reduce((sum, product) => sum + (product.price * product.quantity), 0);
    }
  }
  
  let discount = 0;
  
  if (this.discountType === 'percentage') {
    discount = (applicableAmount * this.discountValue) / 100;
    
    // Aplicar límite (si exixte)
    if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
      discount = this.maxDiscountAmount;
    }
  } else if (this.discountType === 'fixed_amount') {
    discount = Math.min(this.discountValue, applicableAmount);
  }
  
  return {
    applicableAmount,
    discountAmount: Math.round(discount * 100) / 100,
    finalAmount: applicableAmount - discount
  };
};

// Registrar uso del cupón
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
  this.currentUsage += 1;
  
  // Actualizar estado si se agotó
  if (this.usageLimit && this.currentUsage >= this.usageLimit) {
    this.status = 'depleted';
  }
  
  this.updatedAt = new Date();
  
  return await this.save();
};

// Verificar si está expirado y actualizar estado
couponSchema.methods.checkExpiration = function checkExpiration() {
  if (new Date() > this.expirationDate && this.status === 'active') {
    this.status = 'expired';
    return true;
  }
  return false;
};


// Actualizar el estado antes de guardar
couponSchema.pre('save', function(next) {
  this.checkExpiration();
  
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  
  next();
});


couponSchema.index({ code: 1, company: 1 });
couponSchema.index({ company: 1, status: 1 });
couponSchema.index({ expirationDate: 1 });
couponSchema.index({ 'usageHistory.saleId': 1 });
couponSchema.index({ 'usageHistory.customerId': 1 });

const model = mongoose.model('Coupons', couponSchema, 'coupons');
module.exports = model;