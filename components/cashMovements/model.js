const mongoose = require('mongoose');

const { Schema } = mongoose;

const cashMovementSchema = new Schema({
  // Identificación
  movementNumber: { 
    type: String, 
    unique: true, 
    required: true 
  },
  
  // Tipo de movimiento
  type: { 
    type: String, 
    enum: ['sale', 'expense', 'withdrawal', 'initial_cash', 'change_denomination', 'refund', 'other'],
    required: true 
  },
  
  // Información del movimiento
  amount: { 
    type: Number, 
    required: true 
  },
  
  concept: { 
    type: String, 
    required: true 
  },
  
  description: String,
  
  // Método de pago
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'card', 'mixed'],
    default: 'cash'
  },
  
  // Referencias
  user: { 
    type: Schema.ObjectId, 
    ref: 'Users', 
    required: true 
  },
  
  company: { 
    type: Schema.ObjectId, 
    ref: 'Companies' 
  },
  
  // Información adicional
  cashRegister: String,
  
  // Referencia a venta (si aplica)
  saleReference: { 
    type: Schema.ObjectId, 
    ref: 'Sales' 
  },
  
  // Comprobante
  receiptNumber: String,
  
  // Control
  authorized: { 
    type: Boolean, 
    default: true 
  },
  
  authorizedBy: { 
    type: Schema.ObjectId, 
    ref: 'Users' 
  },
  
  notes: String,
  
  disable: { 
    type: Boolean, 
    default: false 
  }
}, { 
  timestamps: true 
});

// Generar número de movimiento único
cashMovementSchema.statics.generateMovementNumber = async function generateMovementNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `MOV-${dateStr}`;
  
  const lastMovement = await this.findOne({
    movementNumber: { $regex: `^${prefix}` }
  }).sort({ movementNumber: -1 });
  
  let sequence = 1;
  if (lastMovement && lastMovement.movementNumber) {
    const parts = lastMovement.movementNumber.split('-');
    const lastSequence = parseInt(parts[parts.length - 1], 10) || 0;
    sequence = lastSequence + 1;
  }
  
  return `${prefix}-${sequence.toString().padStart(4, '0')}`;
};

// Método para obtener el signo del movimiento (entrada/salida)
cashMovementSchema.methods.getMovementSign = function getMovementSign() {
  const inTypes = ['sale', 'initial_cash'];
  const outTypes = ['expense', 'withdrawal', 'refund'];
  
  if (inTypes.includes(this.type)) {
    return 1;
  }
  if (outTypes.includes(this.type)) {
    return -1;
  }
  return 0; 
};

// Método para obtener descripción del tipo
cashMovementSchema.methods.getTypeDescription = function getTypeDescription() {
  const descriptions = {
    sale: 'Venta',
    expense: 'Gasto',
    withdrawal: 'Retiro',
    initial_cash: 'Efectivo Inicial',
    change_denomination: 'Cambio de Denominación',
    refund: 'Devolución',
    other: 'Otro'
  };
  
  return descriptions[this.type] || this.type;
};

// Método para formatear el movimiento
cashMovementSchema.methods.getFormattedMovement = function getFormattedMovement() {
  const sign = this.getMovementSign();
  let signSymbol = '±';
  if (sign > 0) {
    signSymbol = '+';
  } else if (sign < 0) {
    signSymbol = '-';
  }
  
  return {
    number: this.movementNumber,
    type: this.getTypeDescription(),
    concept: this.concept,
    amount: this.amount,
    sign: signSymbol,
    date: this.createdAt,
    user: this.user,
    cashRegister: this.cashRegister || 'N/A'
  };
};

module.exports = mongoose.model('CashMovements', cashMovementSchema, 'cashMovements');