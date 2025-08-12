const store = require('./store');

// ===== VALIDACIONES =====
const validatePrinterConfig = (printerData) => {
  if (!printerData.name) throw new Error('Printer name is required');
  if (!printerData.type) throw new Error('Printer type is required');
  if (!printerData.connection || !printerData.connection.type) {
    throw new Error('Connection type is required');
  }

  const validTypes = ['thermal', 'laser', 'inkjet', 'dot-matrix'];
  if (!validTypes.includes(printerData.type)) {
    throw new Error('Invalid printer type. Use: thermal, laser, inkjet, or dot-matrix');
  }

  const validConnectionTypes = ['usb', 'serial', 'network', 'bluetooth'];
  if (!validConnectionTypes.includes(printerData.connection.type)) {
    throw new Error('Invalid connection type. Use: usb, serial, network, or bluetooth');
  }

  // Validaciones específicas por tipo de conexión
  if (printerData.connection.type === 'network' && !printerData.connection.ipAddress) {
    throw new Error('IP address is required for network connections');
  }

  if (printerData.connection.type === 'bluetooth' && !printerData.connection.macAddress) {
    throw new Error('MAC address is required for Bluetooth connections');
  }

  if (['usb', 'serial'].includes(printerData.connection.type) && !printerData.connection.port) {
    throw new Error('Port is required for USB/Serial connections');
  }
};

const validatePrintJob = (jobData) => {
  if (!jobData.printerId) throw new Error('Printer ID is required');
  if (!jobData.document || !jobData.document.type) throw new Error('Document type is required');
  if (!jobData.document.id) throw new Error('Document ID is required');

  const validDocumentTypes = ['ticket', 'report', 'cut', 'custom'];
  if (!validDocumentTypes.includes(jobData.document.type)) {
    throw new Error('Invalid document type. Use: ticket, report, cut, or custom');
  }
};

// ===== CONTROLADORES DE CONFIGURACIÓN =====

/**
 * Crear nueva configuración de impresora
 */
function createPrinterConfig(printerData) {
  try {
    validatePrinterConfig(printerData);
    return store.createPrinterConfig(printerData);
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Obtener configuraciones de impresoras
 */
function getPrinterConfigs(filters = {}) {
  return store.getPrinterConfigs(filters);
}

/**
 * Obtener configuración de impresora por ID
 */
function getPrinterConfigById(printerId) {
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  return store.getPrinterConfigById(printerId);
}

/**
 * Actualizar configuración de impresora
 */
function updatePrinterConfig(printerId, printerData) {
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  try {
    validatePrinterConfig(printerData);
    return store.updatePrinterConfig(printerId, printerData);
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Eliminar configuración de impresora
 */
function deletePrinterConfig(printerId) {
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  return store.deletePrinterConfig(printerId);
}

/**
 * Obtener impresora por defecto para una caja
 */
function getDefaultPrinter(cashRegister, companyId) {
  if (!cashRegister) {
    return Promise.reject('Cash register is required');
  }
  
  return store.getDefaultPrinter(cashRegister, companyId);
}

/**
 * Obtener impresoras disponibles para una caja
 */
function getAvailablePrinters(cashRegister, companyId) {
  if (!cashRegister) {
    return Promise.reject('Cash register is required');
  }
  
  return store.getAvailablePrinters(cashRegister, companyId);
}

/**
 * Probar conexión de impresora
 */
function testPrinterConnection(printerId) {
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  return store.testPrinterConnection(printerId);
}

/**
 * Asignar impresora a caja registradora
 */
function assignPrinterToCashRegister(printerId, cashRegister, isDefault = false) {
  if (!printerId || !cashRegister) {
    return Promise.reject('Printer ID and cash register are required');
  }
  
  return store.assignPrinterToCashRegister(printerId, cashRegister, isDefault);
}

// ===== CONTROLADORES DE COLA DE IMPRESIÓN =====

/**
 * Crear trabajo de impresión
 */
function createPrintJob(jobData) {
  try {
    validatePrintJob(jobData);
    return store.createPrintJob(jobData);
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Obtener cola de impresión
 */
function getPrintQueue(filters = {}) {
  return store.getPrintQueue(filters);
}

/**
 * Obtener trabajo de impresión por ID
 */
function getPrintJobById(jobId) {
  if (!jobId) {
    return Promise.reject('Job ID is required');
  }
  
  return store.getPrintJobById(jobId);
}

/**
 * Procesar siguiente trabajo en cola
 */
function processNextJob(printerId, userId) {
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  return store.processNextJob(printerId, userId);
}

/**
 * Cancelar trabajo de impresión
 */
function cancelPrintJob(jobId, reason, userId) {
  if (!jobId) {
    return Promise.reject('Job ID is required');
  }
  
  return store.cancelPrintJob(jobId, reason, userId);
}

/**
 * Reenviar trabajo fallido
 */
function retryPrintJob(jobId, userId) {
  if (!jobId) {
    return Promise.reject('Job ID is required');
  }
  
  return store.retryPrintJob(jobId, userId);
}

/**
 * Obtener estadísticas de impresión
 */
function getPrintStats(filters = {}) {
  return store.getPrintStats(filters);
}

// ===== CONTROLADORES DE IMPRESIÓN DIRECTA =====

/**
 * Imprimir ticket directamente
 */
function printTicket(ticketId, printerId, options = {}) {
  if (!ticketId) {
    return Promise.reject('Ticket ID is required');
  }
  
  return store.printTicket(ticketId, printerId, options);
}

/**
 * Imprimir reporte directamente
 */
function printReport(reportId, printerId, options = {}) {
  if (!reportId) {
    return Promise.reject('Report ID is required');
  }
  
  return store.printReport(reportId, printerId, options);
}

/**
 * Imprimir corte de caja directamente
 */
function printCashRegisterCut(cutId, printerId, options = {}) {
  if (!cutId) {
    return Promise.reject('Cut ID is required');
  }
  
  return store.printCashRegisterCut(cutId, printerId, options);
}

/**
 * Imprimir texto personalizado
 */
function printCustomText(text, printerId, options = {}) {
  if (!text) {
    return Promise.reject('Text content is required');
  }
  
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  return store.printCustomText(text, printerId, options);
}

// ===== CONTROLADORES DE MANTENIMIENTO =====

/**
 * Limpiar cola de trabajos completados
 */
function cleanCompletedJobs(olderThanDays = 7) {
  return store.cleanCompletedJobs(olderThanDays);
}

/**
 * Actualizar estado de impresoras
 */
function updatePrinterStatuses() {
  return store.updatePrinterStatuses();
}

/**
 * Obtener estado general del sistema de impresión
 */
function getSystemStatus() {
  return store.getSystemStatus();
}

/**
 * Configurar impresión automática
 */
function configureAutoPrint(printerId, documentType, enabled, copies = 1) {
  if (!printerId || !documentType) {
    return Promise.reject('Printer ID and document type are required');
  }
  
  const validDocumentTypes = ['sale', 'refund', 'cashRegisterCut', 'report'];
  if (!validDocumentTypes.includes(documentType)) {
    return Promise.reject('Invalid document type');
  }
  
  return store.configureAutoPrint(printerId, documentType, enabled, copies);
}

// ===== CONTROLADORES ESPECÍFICOS POR TIPO DE IMPRESORA =====

/**
 * Abrir cajón de dinero
 */
function openCashDrawer(printerId, pin = 0) {
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  return store.openCashDrawer(printerId, pin);
}

/**
 * Cortar papel
 */
function cutPaper(printerId, lines = 3) {
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  return store.cutPaper(printerId, lines);
}

/**
 * Obtener estado del papel
 */
function getPaperStatus(printerId) {
  if (!printerId) {
    return Promise.reject('Printer ID is required');
  }
  
  return store.getPaperStatus(printerId);
}

/**
 * Actualizar estado del papel
 */
function updatePaperStatus(printerId, status) {
  if (!printerId || !status) {
    return Promise.reject('Printer ID and status are required');
  }
  
  const validStatuses = ['ok', 'low', 'out', 'unknown'];
  if (!validStatuses.includes(status)) {
    return Promise.reject('Invalid paper status. Use: ok, low, out, or unknown');
  }
  
  return store.updatePaperStatus(printerId, status);
}

// ===== EXPORTACIONES =====
module.exports = {
  // Configuración de impresoras
  createPrinterConfig,
  getPrinterConfigs,
  getPrinterConfigById,
  updatePrinterConfig,
  deletePrinterConfig,
  getDefaultPrinter,
  getAvailablePrinters,
  testPrinterConnection,
  assignPrinterToCashRegister,
  
  // Cola de impresión
  createPrintJob,
  getPrintQueue,
  getPrintJobById,
  processNextJob,
  cancelPrintJob,
  retryPrintJob,
  getPrintStats,
  
  // Impresión directa
  printTicket,
  printReport,
  printCashRegisterCut,
  printCustomText,
  
  // Mantenimiento
  cleanCompletedJobs,
  updatePrinterStatuses,
  getSystemStatus,
  configureAutoPrint,
  
  // Funciones específicas
  openCashDrawer,
  cutPaper,
  getPaperStatus,
  updatePaperStatus
};