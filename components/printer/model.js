const mongoose = require('mongoose');

const { Schema } = mongoose;

// ===== ESQUEMA DE CONFIGURACIÓN DE IMPRESORAS =====
const printerConfigSchema = new Schema({
  // Identificación de la impresora
  name: { type: String, required: true },
  description: String,
  
  // Tipo y modelo de impresora
  type: { 
    type: String, 
    enum: ['thermal', 'laser', 'inkjet', 'dot-matrix'], 
    default: 'thermal',
    required: true 
  },
  model: String,
  brand: String,
  
  // Configuración de conexión
  connection: {
    type: { 
      type: String, 
      enum: ['usb', 'serial', 'network', 'bluetooth'], 
      required: true 
    },
    // Para conexiones USB/Serial
    port: String,
    baudRate: { type: Number, default: 9600 },
    
    // Para conexiones de red
    ipAddress: String,
    networkPort: { type: Number, default: 9100 },
    
    // Para Bluetooth
    macAddress: String,
    
    // Configuración general
    timeout: { type: Number, default: 5000 }
  },
  
  // Configuración de formato
  format: {
    // Ancho del papel
    paperWidth: { 
      type: String, 
      enum: ['58mm', '80mm', 'A4', 'Letter'], 
      default: '80mm' 
    },
    
    // Caracteres por línea
    charactersPerLine: { type: Number, default: 42 },
    
    // Configuración de fuente
    fontSize: { 
      type: String, 
      enum: ['small', 'medium', 'large'], 
      default: 'medium' 
    },
    
    // Configuración de corte
    autoCut: { type: Boolean, default: true },
    cutLines: { type: Number, default: 3 },
    
    // Configuración de cajón
    openDrawer: { type: Boolean, default: false },
    drawerPin: { type: Number, default: 0 }
  },
  
  // Configuración de codificación
  encoding: {
    charset: { 
      type: String, 
      enum: ['CP437', 'CP850', 'CP858', 'CP860', 'CP863', 'CP865', 'CP866', 'CP1252', 'ISO-8859-1'], 
      default: 'CP437' 
    },
    codeTable: { type: Number, default: 0 }
  },
  
  // Estado de la impresora
  status: {
    isActive: { type: Boolean, default: true },
    isOnline: { type: Boolean, default: false },
    lastConnection: Date,
    lastError: String,
    paperStatus: { 
      type: String, 
      enum: ['ok', 'low', 'out', 'unknown'], 
      default: 'unknown' 
    }
  },
  
  // Asignación por caja registradora
  assignedTo: [{
    cashRegister: String,
    isDefault: { type: Boolean, default: false }
  }],
  
  // Configuración específica por tipo de documento
  documentTypes: {
    sale: {
      enabled: { type: Boolean, default: true },
      autoPrint: { type: Boolean, default: false },
      copies: { type: Number, default: 1 }
    },
    refund: {
      enabled: { type: Boolean, default: true },
      autoPrint: { type: Boolean, default: false },
      copies: { type: Number, default: 1 }
    },
    cashRegisterCut: {
      enabled: { type: Boolean, default: true },
      autoPrint: { type: Boolean, default: false },
      copies: { type: Number, default: 1 }
    },
    report: {
      enabled: { type: Boolean, default: true },
      autoPrint: { type: Boolean, default: false },
      copies: { type: Number, default: 1 }
    }
  },
  
  // Información adicional
  notes: String,
  company: { type: Schema.ObjectId, ref: 'Companies' },
  disable: { type: Boolean, default: false }
  
}, { timestamps: true });

// ===== ESQUEMA DE COLA DE IMPRESIÓN =====
const printQueueSchema = new Schema({
  // Identificación del trabajo
  jobId: { type: String, unique: true, required: true },
  
  // Impresora asignada
  printer: { 
    type: Schema.ObjectId, 
    ref: 'PrinterConfigs', 
    required: true 
  },
  
  // Documento a imprimir
  document: {
    type: { 
      type: String, 
      enum: ['ticket', 'report', 'cut', 'custom'], 
      required: true 
    },
    id: { type: Schema.ObjectId, required: true },
    data: Schema.Types.Mixed // Datos específicos del documento
  },
  
  // Configuración del trabajo
  printOptions: {
    copies: { type: Number, default: 1 },
    format: String,
    priority: { 
      type: String, 
      enum: ['low', 'normal', 'high', 'urgent'], 
      default: 'normal' 
    }
  },
  
  // Estado del trabajo
  status: {
    current: { 
      type: String, 
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'], 
      default: 'pending' 
    },
    progress: { type: Number, default: 0 }, // Porcentaje de progreso
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 }
  },
  
  // Información de procesamiento
  processing: {
    startedAt: Date,
    completedAt: Date,
    processedBy: { type: Schema.ObjectId, ref: 'Users' },
    error: String,
    logs: [String]
  },
  
  // Información del solicitante
  requestedBy: { type: Schema.ObjectId, ref: 'Users', required: true },
  company: { type: Schema.ObjectId, ref: 'Companies' },
  
  // Control de tiempo
  scheduledFor: Date, // Para trabajos programados
  expiresAt: Date     // Para trabajos que caducan
  
}, { timestamps: true });

// ===== MÉTODOS ESTÁTICOS =====

// Generar ID de trabajo único
printQueueSchema.statics.generateJobId = function generateJobId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 5);
  return `JOB-${timestamp}-${random.toUpperCase()}`;
};

// Obtener impresora por defecto para una caja
printerConfigSchema.statics.getDefaultPrinter = async function getDefaultPrinter(cashRegister, companyId) {
  const query = {
    'assignedTo.cashRegister': cashRegister,
    'assignedTo.isDefault': true,
    'status.isActive': true,
    disable: false
  };
  
  if (companyId && companyId !== 'default-company-id') {
    query.company = companyId;
  }
  
  return this.findOne(query);
};

// Obtener impresoras disponibles para una caja
printerConfigSchema.statics.getAvailablePrinters = async function getAvailablePrinters(cashRegister, companyId) {
  const query = {
    'assignedTo.cashRegister': cashRegister,
    'status.isActive': true,
    disable: false
  };
  
  if (companyId && companyId !== 'default-company-id') {
    query.company = companyId;
  }
  
  return this.find(query).sort({ 'assignedTo.isDefault': -1, name: 1 });
};

// ===== MÉTODOS DE INSTANCIA =====

// Probar conexión de impresora
printerConfigSchema.methods.testConnection = async function testConnection() {
  try {
    // Aquí iría la lógica específica para probar la conexión
    // dependiendo del tipo de conexión (USB, Red, Bluetooth, etc.)
    
    this.status.lastConnection = new Date();
    this.status.isOnline = true;
    this.status.lastError = null;
    
    await this.save();
    
    return {
      success: true,
      message: 'Connection successful',
      connectionTime: new Date()
    };
    
  } catch (error) {
    this.status.isOnline = false;
    this.status.lastError = error.message;
    await this.save();
    
    return {
      success: false,
      message: 'Connection failed',
      error: error.message
    };
  }
};

// Actualizar estado de papel
printerConfigSchema.methods.updatePaperStatus = function updatePaperStatus(status) {
  const validStatuses = ['ok', 'low', 'out', 'unknown'];
  if (validStatuses.includes(status)) {
    this.status.paperStatus = status;
    return this.save();
  }
  throw new Error('Invalid paper status');
};

// ===== ÍNDICES =====
printerConfigSchema.index({ name: 1, company: 1 });
printerConfigSchema.index({ 'assignedTo.cashRegister': 1, 'assignedTo.isDefault': -1 });
printerConfigSchema.index({ 'status.isActive': 1, disable: 1 });

printQueueSchema.index({ jobId: 1 });
printQueueSchema.index({ printer: 1, 'status.current': 1 });
printQueueSchema.index({ 'status.current': 1, createdAt: 1 });
printQueueSchema.index({ requestedBy: 1, createdAt: -1 });
printQueueSchema.index({ scheduledFor: 1 });
printQueueSchema.index({ expiresAt: 1 });

// ===== EXPORTACIONES =====
const PrinterConfig = mongoose.model('PrinterConfigs', printerConfigSchema, 'printerConfigs');
const PrintQueue = mongoose.model('PrintQueue', printQueueSchema, 'printQueue');

module.exports = {
  PrinterConfig,
  PrintQueue
};