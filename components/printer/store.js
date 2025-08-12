const { PrinterConfig, PrintQueue } = require('./model');

// ===== CONFIGURACIÓN DE IMPRESORAS =====

/**
 * Crear nueva configuración de impresora
 */
async function createPrinterConfig(printerData) {
  try {
    // Verificar si ya existe una impresora con el mismo nombre
    const existingPrinter = await PrinterConfig.findOne({
      name: printerData.name,
      company: printerData.companyId,
      disable: false
    });

    if (existingPrinter) {
      throw new Error('A printer with this name already exists');
    }

    // Crear nueva configuración
    const newPrinter = new PrinterConfig({
      name: printerData.name,
      description: printerData.description,
      type: printerData.type,
      model: printerData.model,
      brand: printerData.brand,
      connection: printerData.connection,
      format: printerData.format || {},
      encoding: printerData.encoding || {},
      assignedTo: printerData.assignedTo || [],
      documentTypes: printerData.documentTypes || {},
      notes: printerData.notes,
      company: printerData.companyId
    });

    const savedPrinter = await newPrinter.save();

    return {
      success: true,
      printer: {
        id: savedPrinter._id, // eslint-disable-line no-underscore-dangle
        name: savedPrinter.name,
        type: savedPrinter.type,
        connection: savedPrinter.connection.type
      },
      message: `Printer ${savedPrinter.name} created successfully`
    };

  } catch (error) {
    console.error('Error creating printer config:', error);
    throw error;
  }
}

/**
 * Obtener configuraciones de impresoras
 */
async function getPrinterConfigs(filters = {}) {
  try {
    const query = { disable: false };

    if (filters.type) query.type = filters.type;
    if (filters.connectionType) query['connection.type'] = filters.connectionType;
    if (filters.isActive !== undefined) query['status.isActive'] = filters.isActive;
    if (filters.companyId && filters.companyId !== 'default-company-id') {
      query.company = filters.companyId;
    }

    const printers = await PrinterConfig.find(query)
      .sort({ name: 1 })
      .limit(filters.limit || 50);

    return {
      printers,
      count: printers.length,
      filters
    };

  } catch (error) {
    console.error('Error getting printer configs:', error);
    throw error;
  }
}

/**
 * Obtener configuración de impresora por ID
 */
async function getPrinterConfigById(printerId) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }
    return printer;

  } catch (error) {
    console.error('Error getting printer by ID:', error);
    throw error;
  }
}

/**
 * Actualizar configuración de impresora
 */
async function updatePrinterConfig(printerId, printerData) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    // Actualizar campos
    Object.keys(printerData).forEach(key => {
      if (key !== '_id' && key !== 'createdAt' && key !== 'updatedAt') {
        printer[key] = printerData[key];
      }
    });

    const updatedPrinter = await printer.save();

    return {
      success: true,
      printer: updatedPrinter,
      message: `Printer ${updatedPrinter.name} updated successfully`
    };

  } catch (error) {
    console.error('Error updating printer config:', error);
    throw error;
  }
}

/**
 * Eliminar configuración de impresora
 */
async function deletePrinterConfig(printerId) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    printer.disable = true;
    await printer.save();

    return {
      success: true,
      message: `Printer ${printer.name} deleted successfully`
    };

  } catch (error) {
    console.error('Error deleting printer config:', error);
    throw error;
  }
}

/**
 * Obtener impresora por defecto para una caja
 */
async function getDefaultPrinter(cashRegister, companyId) {
  try {
    return await PrinterConfig.getDefaultPrinter(cashRegister, companyId);
  } catch (error) {
    console.error('Error getting default printer:', error);
    throw error;
  }
}

/**
 * Obtener impresoras disponibles para una caja
 */
async function getAvailablePrinters(cashRegister, companyId) {
  try {
    return await PrinterConfig.getAvailablePrinters(cashRegister, companyId);
  } catch (error) {
    console.error('Error getting available printers:', error);
    throw error;
  }
}

/**
 * Probar conexión de impresora
 */
async function testPrinterConnection(printerId) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    return await printer.testConnection();

  } catch (error) {
    console.error('Error testing printer connection:', error);
    throw error;
  }
}

/**
 * Asignar impresora a caja registradora
 */
async function assignPrinterToCashRegister(printerId, cashRegister, isDefault = false) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    // Si es por defecto, quitar el default de otras impresoras
    if (isDefault) {
      await PrinterConfig.updateMany(
        {
          'assignedTo.cashRegister': cashRegister,
          company: printer.company
        },
        {
          $set: { 'assignedTo.$.isDefault': false }
        }
      );
    }

    // Verificar si ya está asignada a esta caja
    const existingAssignment = printer.assignedTo.find(
      assignment => assignment.cashRegister === cashRegister
    );

    if (existingAssignment) {
      existingAssignment.isDefault = isDefault;
    } else {
      printer.assignedTo.push({
        cashRegister,
        isDefault
      });
    }

    await printer.save();

    return {
      success: true,
      message: `Printer ${printer.name} assigned to ${cashRegister} ${isDefault ? 'as default' : ''}`
    };

  } catch (error) {
    console.error('Error assigning printer to cash register:', error);
    throw error;
  }
}

// ===== COLA DE IMPRESIÓN =====

/**
 * Crear trabajo de impresión
 */
async function createPrintJob(jobData) {
  try {
    // Generar ID de trabajo
    const jobId = PrintQueue.generateJobId();

    // Crear trabajo
    const newJob = new PrintQueue({
      jobId,
      printer: jobData.printerId,
      document: {
        type: jobData.document.type,
        id: jobData.document.id,
        data: jobData.document.data
      },
      printOptions: jobData.printOptions || {},
      requestedBy: jobData.userId,
      company: jobData.companyId,
      scheduledFor: jobData.scheduledFor,
      expiresAt: jobData.expiresAt
    });

    const savedJob = await newJob.save();

    return {
      success: true,
      job: {
        id: savedJob._id, // eslint-disable-line no-underscore-dangle
        jobId: savedJob.jobId,
        status: savedJob.status.current
      },
      message: `Print job ${savedJob.jobId} created successfully`
    };

  } catch (error) {
    console.error('Error creating print job:', error);
    throw error;
  }
}

/**
 * Obtener cola de impresión
 */
async function getPrintQueue(filters = {}) {
  try {
    const query = {};

    if (filters.printerId) query.printer = filters.printerId;
    if (filters.status) query['status.current'] = filters.status;
    if (filters.documentType) query['document.type'] = filters.documentType;
    if (filters.requestedBy) query.requestedBy = filters.requestedBy;
    if (filters.companyId && filters.companyId !== 'default-company-id') {
      query.company = filters.companyId;
    }

    const jobs = await PrintQueue.find(query)
      .populate('printer', 'name type')
      .populate('requestedBy', 'userName name')
      .sort({ 'printOptions.priority': -1, createdAt: 1 })
      .limit(filters.limit || 50);

    return {
      jobs,
      count: jobs.length,
      filters
    };

  } catch (error) {
    console.error('Error getting print queue:', error);
    throw error;
  }
}

/**
 * Obtener trabajo de impresión por ID
 */
async function getPrintJobById(jobId) {
  try {
    const job = await PrintQueue.findOne({ jobId })
      .populate('printer', 'name type connection format')
      .populate('requestedBy', 'userName name');

    if (!job) {
      throw new Error('Print job not found');
    }

    return job;

  } catch (error) {
    console.error('Error getting print job by ID:', error);
    throw error;
  }
}

/**
 * Procesar siguiente trabajo en cola
 */
async function processNextJob(printerId, userId) {
  try {
    // Buscar el siguiente trabajo pendiente para esta impresora
    const nextJob = await PrintQueue.findOne({
      printer: printerId,
      'status.current': 'pending',
      $or: [
        { scheduledFor: { $lte: new Date() } },
        { scheduledFor: { $exists: false } }
      ]
    }).sort({ 'printOptions.priority': -1, createdAt: 1 });

    if (!nextJob) {
      return {
        success: false,
        message: 'No pending jobs found for this printer'
      };
    }

    // Marcar como procesando
    nextJob.status.current = 'processing';
    nextJob.processing.startedAt = new Date();
    nextJob.processing.processedBy = userId;
    nextJob.status.attempts += 1;

    await nextJob.save();

    // Aquí iría la lógica real de impresión
    // Por ahora simulamos que se procesa correctamente
    
    // Simular procesamiento
    setTimeout(async () => {
      try {
        nextJob.status.current = 'completed';
        nextJob.processing.completedAt = new Date();
        nextJob.status.progress = 100;
        await nextJob.save();
      } catch (error) {
        console.error('Error completing job:', error);
      }
    }, 1000);

    return {
      success: true,
      job: {
        id: nextJob._id, // eslint-disable-line no-underscore-dangle
        jobId: nextJob.jobId,
        documentType: nextJob.document.type,
        status: nextJob.status.current
      },
      message: `Job ${nextJob.jobId} processing started`
    };

  } catch (error) {
    console.error('Error processing next job:', error);
    throw error;
  }
}

/**
 * Cancelar trabajo de impresión
 */
async function cancelPrintJob(jobId, reason, userId) {
  try {
    const job = await PrintQueue.findOne({ jobId });
    if (!job) {
      throw new Error('Print job not found');
    }

    if (job.status.current === 'completed') {
      throw new Error('Cannot cancel completed job');
    }

    job.status.current = 'cancelled';
    job.processing.processedBy = userId;
    job.processing.completedAt = new Date();
    job.processing.logs.push(`Cancelled by user: ${reason}`);

    await job.save();

    return {
      success: true,
      message: `Job ${jobId} cancelled successfully`
    };

  } catch (error) {
    console.error('Error cancelling print job:', error);
    throw error;
  }
}

/**
 * Reenviar trabajo fallido
 */
async function retryPrintJob(jobId, userId) {
  try {
    const job = await PrintQueue.findOne({ jobId });
    if (!job) {
      throw new Error('Print job not found');
    }

    if (job.status.current !== 'failed') {
      throw new Error('Only failed jobs can be retried');
    }

    if (job.status.attempts >= job.status.maxAttempts) {
      throw new Error('Maximum retry attempts exceeded');
    }

    job.status.current = 'pending';
    job.processing.processedBy = userId;
    job.processing.logs.push(`Retried by user at ${new Date().toISOString()}`);

    await job.save();

    return {
      success: true,
      message: `Job ${jobId} queued for retry`
    };

  } catch (error) {
    console.error('Error retrying print job:', error);
    throw error;
  }
}

/**
 * Obtener estadísticas de impresión
 */
async function getPrintStats(filters = {}) {
  try {
    const query = {};

    if (filters.companyId && filters.companyId !== 'default-company-id') {
      query.company = filters.companyId;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const stats = await PrintQueue.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status.current',
          count: { $sum: 1 },
          documentTypes: {
            $push: '$document.type'
          }
        }
      }
    ]);

    const summary = {
      totalJobs: 0,
      byStatus: {},
      byDocumentType: {}
    };

    stats.forEach(stat => {
      summary.totalJobs += stat.count;
      summary.byStatus[stat._id] = stat.count; // eslint-disable-line no-underscore-dangle

      // Contar tipos de documento
      stat.documentTypes.forEach(docType => {
        summary.byDocumentType[docType] = (summary.byDocumentType[docType] || 0) + 1;
      });
    });

    return summary;

  } catch (error) {
    console.error('Error getting print stats:', error);
    throw error;
  }
}

// ===== IMPRESIÓN DIRECTA =====

/**
 * Imprimir ticket directamente
 */
async function printTicket(ticketId, printerId, options = {}) {
  try {
    const jobData = {
      printerId,
      document: {
        type: 'ticket',
        id: ticketId,
        data: options
      },
      printOptions: {
        copies: options.copies || 1,
        format: options.format || '80mm',
        priority: options.priority || 'normal'
      },
      userId: options.userId,
      companyId: options.companyId
    };

    return await createPrintJob(jobData);

  } catch (error) {
    console.error('Error printing ticket:', error);
    throw error;
  }
}

/**
 * Imprimir reporte directamente
 */
async function printReport(reportId, printerId, options = {}) {
  try {
    const jobData = {
      printerId,
      document: {
        type: 'report',
        id: reportId,
        data: options
      },
      printOptions: {
        copies: options.copies || 1,
        priority: options.priority || 'normal'
      },
      userId: options.userId,
      companyId: options.companyId
    };

    return await createPrintJob(jobData);

  } catch (error) {
    console.error('Error printing report:', error);
    throw error;
  }
}

/**
 * Imprimir corte de caja directamente
 */
async function printCashRegisterCut(cutId, printerId, options = {}) {
  try {
    const jobData = {
      printerId,
      document: {
        type: 'cut',
        id: cutId,
        data: options
      },
      printOptions: {
        copies: options.copies || 1,
        priority: options.priority || 'high'
      },
      userId: options.userId,
      companyId: options.companyId
    };

    return await createPrintJob(jobData);

  } catch (error) {
    console.error('Error printing cash register cut:', error);
    throw error;
  }
}

/**
 * Imprimir texto personalizado
 */
async function printCustomText(text, printerId, options = {}) {
  try {
    const jobData = {
      printerId,
      document: {
        type: 'custom',
        id: 'custom-text',
        data: { text, ...options }
      },
      printOptions: {
        copies: options.copies || 1,
        priority: options.priority || 'normal'
      },
      userId: options.userId,
      companyId: options.companyId
    };

    return await createPrintJob(jobData);

  } catch (error) {
    console.error('Error printing custom text:', error);
    throw error;
  }
}

// ===== MANTENIMIENTO =====

/**
 * Limpiar cola de trabajos completados
 */
async function cleanCompletedJobs(olderThanDays = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await PrintQueue.deleteMany({
      'status.current': { $in: ['completed', 'cancelled'] },
      'processing.completedAt': { $lt: cutoffDate }
    });

    return {
      success: true,
      deletedCount: result.deletedCount,
      message: `Cleaned ${result.deletedCount} completed jobs older than ${olderThanDays} days`
    };

  } catch (error) {
    console.error('Error cleaning completed jobs:', error);
    throw error;
  }
}

/**
 * Actualizar estado de impresoras
 */
async function updatePrinterStatuses() {
  try {
    // ESLINT FIX: Cambiar for...of por forEach para evitar await-in-loop
    const printers = await PrinterConfig.find({ disable: false });
    let updatedCount = 0;

    // Procesar impresoras en paralelo en lugar de secuencialmente
    const connectionResults = await Promise.allSettled(
      printers.map(printer => printer.testConnection())
    );

    connectionResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        updatedCount += 1;
      }
    });

    return {
      success: true,
      totalPrinters: printers.length,
      updatedCount,
      message: `Updated status for ${updatedCount} of ${printers.length} printers`
    };

  } catch (error) {
    console.error('Error updating printer statuses:', error);
    throw error;
  }
}

/**
 * Obtener estado general del sistema de impresión
 */
async function getSystemStatus() {
  try {
    const [printerStats, queueStats] = await Promise.all([
      PrinterConfig.aggregate([
        { $match: { disable: false } },
        {
          $group: {
            _id: '$status.isOnline',
            count: { $sum: 1 }
          }
        }
      ]),
      PrintQueue.aggregate([
        {
          $group: {
            _id: '$status.current',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const status = {
      printers: {
        total: 0,
        online: 0,
        offline: 0
      },
      queue: {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
      }
    };

    printerStats.forEach(stat => {
      status.printers.total += stat.count;
      if (stat._id === true) { // eslint-disable-line no-underscore-dangle
        status.printers.online = stat.count;
      } else {
        status.printers.offline = stat.count;
      }
    });

    queueStats.forEach(stat => {
      status.queue[stat._id] = stat.count; // eslint-disable-line no-underscore-dangle
    });

    return status;

  } catch (error) {
    console.error('Error getting system status:', error);
    throw error;
  }
}

/**
 * Configurar impresión automática
 */
async function configureAutoPrint(printerId, documentType, enabled, copies = 1) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    if (!printer.documentTypes[documentType]) {
      printer.documentTypes[documentType] = {};
    }

    printer.documentTypes[documentType].enabled = enabled;
    printer.documentTypes[documentType].autoPrint = enabled;
    printer.documentTypes[documentType].copies = copies;

    await printer.save();

    return {
      success: true,
      message: `Auto-print for ${documentType} ${enabled ? 'enabled' : 'disabled'} on ${printer.name}`
    };

  } catch (error) {
    console.error('Error configuring auto print:', error);
    throw error;
  }
}

// ===== FUNCIONES ESPECÍFICAS =====

/**
 * Abrir cajón de dinero
 */
async function openCashDrawer(printerId, pin = 0) { // eslint-disable-line no-unused-vars
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    if (printer.type !== 'thermal') {
      throw new Error('Cash drawer only supported on thermal printers');
    }

    // Aquí iría la lógica específica para abrir el cajón
    // Por ahora simulamos la operación
    // El parámetro 'pin' se usaría en la implementación real

    return {
      success: true,
      message: `Cash drawer opened on ${printer.name}`
    };

  } catch (error) {
    console.error('Error opening cash drawer:', error);
    throw error;
  }
}

/**
 * Cortar papel
 */
async function cutPaper(printerId, lines = 3) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    if (printer.type !== 'thermal') {
      throw new Error('Paper cutting only supported on thermal printers');
    }

    // Aquí iría la lógica específica para cortar papel

    return {
      success: true,
      message: `Paper cut on ${printer.name} with ${lines} lines`
    };

  } catch (error) {
    console.error('Error cutting paper:', error);
    throw error;
  }
}

/**
 * Obtener estado del papel
 */
async function getPaperStatus(printerId) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    return {
      printerId,
      printerName: printer.name,
      paperStatus: printer.status.paperStatus,
      lastUpdate: printer.status.lastConnection
    };

  } catch (error) {
    console.error('Error getting paper status:', error);
    throw error;
  }
}

/**
 * Actualizar estado del papel
 */
async function updatePaperStatus(printerId, status) {
  try {
    const printer = await PrinterConfig.findById(printerId);
    if (!printer) {
      throw new Error('Printer not found');
    }

    await printer.updatePaperStatus(status);

    return {
      success: true,
      message: `Paper status updated to ${status} for ${printer.name}`
    };

  } catch (error) {
    console.error('Error updating paper status:', error);
    throw error;
  }
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