const express = require('express');
const response = require('../../network');
const controller = require('./controller');
// ESLINT FIX: Removido 'store' ya que no se usa directamente en network
const passportConfig = require('../../passport');
const Helper = require('../../helpers');

const router = express.Router();

// ===== HELPER PARA RESPUESTAS =====
const handleRequest = (req, res, promise) => {
  promise
    .then(data => response.success(req, res, data, 200))
    .catch(err => response.error(req, res, err.message || 'Internal error', 500, err));
};

// ===== RUTAS ESPECÍFICAS PRIMERO =====

/**
 * Configurar impresión automática
 * PUT /printers/:printerId/auto-print/:documentType
 */
router.put('/:printerId/auto-print/:documentType', passportConfig.isAuth, (req, res) => {
  const { printerId, documentType } = req.params;
  const { enabled, copies } = req.body;

  handleRequest(req, res, controller.configureAutoPrint(printerId, documentType, enabled, copies));
});

/**
 * Obtener impresoras disponibles para una caja
 * GET /printers/available/:cashRegister
 */
router.get('/available/:cashRegister', passportConfig.isAuth, (req, res) => {
  const { cashRegister } = req.params;
  const companyId = Helper.getCompanyId(req);

  handleRequest(req, res, controller.getAvailablePrinters(cashRegister, companyId));
});

/**
 * Obtener impresora por defecto para una caja
 * GET /printers/default/:cashRegister
 */
router.get('/default/:cashRegister', passportConfig.isAuth, (req, res) => {
  const { cashRegister } = req.params;
  const companyId = Helper.getCompanyId(req);

  handleRequest(req, res, controller.getDefaultPrinter(cashRegister, companyId));
});

/**
 * Obtener estadísticas de impresión
 * GET /printers/stats
 */
router.get('/stats', passportConfig.isAuth, (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) 
  };
  
  handleRequest(req, res, controller.getPrintStats(filters));
});

/**
 * Obtener estado general del sistema
 * GET /printers/system/status
 */
router.get('/system/status', passportConfig.isAuth, (req, res) => {
  handleRequest(req, res, controller.getSystemStatus());
});

/**
 * Actualizar estado de todas las impresoras
 * POST /printers/system/update-status
 */
router.post('/system/update-status', passportConfig.isAuth, (req, res) => {
  handleRequest(req, res, controller.updatePrinterStatuses());
});

/**
 * Limpiar trabajos completados
 * POST /printers/system/clean-jobs
 */
router.post('/system/clean-jobs', passportConfig.isAuth, (req, res) => {
  const { olderThanDays } = req.body;
  handleRequest(req, res, controller.cleanCompletedJobs(olderThanDays));
});

// ===== RUTAS DE COLA DE IMPRESIÓN =====

/**
 * Obtener cola de impresión
 * GET /printers/queue
 */
router.get('/queue', passportConfig.isAuth, (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) 
  };
  
  handleRequest(req, res, controller.getPrintQueue(filters));
});

/**
 * Crear trabajo de impresión
 * POST /printers/queue
 */
router.post('/queue', passportConfig.isAuth, (req, res) => {
  const jobData = { 
    ...req.body, 
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };

  handleRequest(req, res, controller.createPrintJob(jobData));
});

/**
 * Obtener trabajo de impresión por ID
 * GET /printers/queue/:jobId
 */
router.get('/queue/:jobId', passportConfig.isAuth, (req, res) => {
  const { jobId } = req.params;
  handleRequest(req, res, controller.getPrintJobById(jobId));
});

/**
 * Cancelar trabajo de impresión
 * POST /printers/queue/:jobId/cancel
 */
router.post('/queue/:jobId/cancel', passportConfig.isAuth, (req, res) => {
  const { jobId } = req.params;
  const { reason } = req.body;
  const userId = Helper.getUserId(req);

  if (!reason) {
    return response.error(req, res, 'Cancellation reason is required', 400);
  }

  return handleRequest(req, res, controller.cancelPrintJob(jobId, reason, userId));
});

/**
 * Reintentar trabajo fallido
 * POST /printers/queue/:jobId/retry
 */
router.post('/queue/:jobId/retry', passportConfig.isAuth, (req, res) => {
  const { jobId } = req.params;
  const userId = Helper.getUserId(req);

  handleRequest(req, res, controller.retryPrintJob(jobId, userId));
});

// ===== RUTAS DE IMPRESIÓN DIRECTA =====

/**
 * Imprimir ticket
 * POST /printers/print/ticket
 */
router.post('/print/ticket', passportConfig.isAuth, (req, res) => {
  const { ticketId, printerId, options } = req.body;
  
  if (!ticketId || !printerId) {
    return response.error(req, res, 'Ticket ID and Printer ID are required', 400);
  }

  const printOptions = {
    ...options,
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req)
  };

  return handleRequest(req, res, controller.printTicket(ticketId, printerId, printOptions));
});

/**
 * Imprimir reporte
 * POST /printers/print/report
 */
router.post('/print/report', passportConfig.isAuth, (req, res) => {
  const { reportId, printerId, options } = req.body;
  
  if (!reportId || !printerId) {
    return response.error(req, res, 'Report ID and Printer ID are required', 400);
  }

  const printOptions = {
    ...options,
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req)
  };

  return handleRequest(req, res, controller.printReport(reportId, printerId, printOptions));
});

/**
 * Imprimir corte de caja
 * POST /printers/print/cut
 */
router.post('/print/cut', passportConfig.isAuth, (req, res) => {
  const { cutId, printerId, options } = req.body;
  
  if (!cutId || !printerId) {
    return response.error(req, res, 'Cut ID and Printer ID are required', 400);
  }

  const printOptions = {
    ...options,
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req)
  };

  return handleRequest(req, res, controller.printCashRegisterCut(cutId, printerId, printOptions));
});

/**
 * Imprimir texto personalizado
 * POST /printers/print/custom
 */
router.post('/print/custom', passportConfig.isAuth, (req, res) => {
  const { text, printerId, options } = req.body;
  
  if (!text || !printerId) {
    return response.error(req, res, 'Text and Printer ID are required', 400);
  }

  const printOptions = {
    ...options,
    userId: Helper.getUserId(req),
    companyId: Helper.getCompanyId(req)
  };

  return handleRequest(req, res, controller.printCustomText(text, printerId, printOptions));
});

// ===== RUTAS CON PARÁMETROS DE IMPRESORA =====

/**
 * Probar conexión de impresora
 * POST /printers/:printerId/test
 */
router.post('/:printerId/test', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  handleRequest(req, res, controller.testPrinterConnection(printerId));
});

/**
 * Asignar impresora a caja registradora
 * POST /printers/:printerId/assign
 */
router.post('/:printerId/assign', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  const { cashRegister, isDefault } = req.body;

  if (!cashRegister) {
    return response.error(req, res, 'Cash register is required', 400);
  }

  return handleRequest(req, res, controller.assignPrinterToCashRegister(printerId, cashRegister, isDefault));
});

/**
 * Procesar siguiente trabajo en cola
 * POST /printers/:printerId/process-next
 */
router.post('/:printerId/process-next', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  const userId = Helper.getUserId(req);

  handleRequest(req, res, controller.processNextJob(printerId, userId));
});

/**
 * Abrir cajón de dinero
 * POST /printers/:printerId/open-drawer
 */
router.post('/:printerId/open-drawer', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  const { pin } = req.body;

  handleRequest(req, res, controller.openCashDrawer(printerId, pin));
});

/**
 * Cortar papel
 * POST /printers/:printerId/cut-paper
 */
router.post('/:printerId/cut-paper', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  const { lines } = req.body;

  handleRequest(req, res, controller.cutPaper(printerId, lines));
});

/**
 * Obtener estado del papel
 * GET /printers/:printerId/paper-status
 */
router.get('/:printerId/paper-status', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  handleRequest(req, res, controller.getPaperStatus(printerId));
});

/**
 * Actualizar estado del papel
 * PUT /printers/:printerId/paper-status
 */
router.put('/:printerId/paper-status', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  const { status } = req.body;

  if (!status) {
    return response.error(req, res, 'Paper status is required', 400);
  }

  return handleRequest(req, res, controller.updatePaperStatus(printerId, status));
});

/**
 * Obtener configuración de impresora por ID
 * GET /printers/:printerId
 */
router.get('/:printerId', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  handleRequest(req, res, controller.getPrinterConfigById(printerId));
});

/**
 * Actualizar configuración de impresora
 * PUT /printers/:printerId
 */
router.put('/:printerId', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  const printerData = req.body;

  handleRequest(req, res, controller.updatePrinterConfig(printerId, printerData));
});

/**
 * Eliminar configuración de impresora
 * DELETE /printers/:printerId
 */
router.delete('/:printerId', passportConfig.isAuth, (req, res) => {
  const { printerId } = req.params;
  handleRequest(req, res, controller.deletePrinterConfig(printerId));
});

// ===== RUTAS GENERALES =====

/**
 * Crear configuración de impresora
 * POST /printers
 */
router.post('/', passportConfig.isAuth, (req, res) => {
  const printerData = { 
    ...req.body, 
    companyId: Helper.getCompanyId(req) !== 'default-company-id' ? Helper.getCompanyId(req) : undefined
  };

  handleRequest(req, res, controller.createPrinterConfig(printerData));
});

/**
 * Obtener lista de impresoras
 * GET /printers
 */
router.get('/', passportConfig.isAuth, (req, res) => {
  const filters = { 
    ...req.query, 
    companyId: Helper.getCompanyId(req) 
  };
  
  handleRequest(req, res, controller.getPrinterConfigs(filters));
});

module.exports = router;