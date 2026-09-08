const { pageOptions } = require('../../helpers/query');
const { applyBranchScope } = require('../../helpers/branchScope');
const mongoose = require('mongoose');
const Model = require('./model');

function parseReportDate(value, endOfDay = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    );
  }
  return new Date(value);
}

function addSell(sell, session = null) {
  const newSales = new Model(sell);
  return newSales.save(session ? { session } : undefined);
}

async function listSales(sellId, companyId, cashierId, filters = {}) {
  const filter = {};
  
  if (sellId) {
    filter._id = sellId;
  }

  if (companyId && companyId !== 'default-company-id') {
    if (mongoose.Types.ObjectId.isValid(companyId)) {
      filter.company = companyId;
    }
  }

  filter.disable = false;
  if (cashierId) filter.createdBy = cashierId;
  if (Array.isArray(filters.branchIds)) {
    applyBranchScope(filter, 'branch', filters.branchIds);
  }


  const { page, limit, skip } = pageOptions(filters);
  const sales = await Model.find(filter)
    .populate('createdBy')
    .populate('company', 'name')
    .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean()
    .exec();
    
  if (filters.paginated) return { items: sales, total: await Model.countDocuments(filter), page, limit };
  return sales;
}

async function getSaleById(saleId, companyId) {
  const filter = { _id: saleId };
  if (companyId) filter.company = companyId;
  const sale = await Model.findOne(filter)
    .populate('createdBy')
    .populate('company')
    .exec();
    
  return sale;
}

function findByIdempotencyKey(key, companyId) {
  return Model.findOne({ idempotencyKey: key, company: companyId });
}


async function listSalesForReports(filters = {}) {
  const query = { disable: false };
  let reportRange = null;
  
 
  if (filters.startDate && filters.endDate) {
    reportRange = {
      $gte: parseReportDate(filters.startDate),
      $lte: parseReportDate(filters.endDate, true)
    };
  } else if (filters.date) {
    const startOfDay = new Date(filters.date);
    const endOfDay = new Date(filters.date);
    endOfDay.setHours(23, 59, 59, 999);
    
    reportRange = {
      $gte: startOfDay,
      $lte: endOfDay
    };
  }

  if (reportRange) {
    query.$or = [
      { createdAt: reportRange },
      { 'refundInfo.refundedAt': reportRange }
    ];
  }
  
  // Filtros adicionales
  if (filters.companyId && filters.companyId !== 'default-company-id') {
    query.company = filters.companyId;
  }
  
  if (filters.cashierId) {
    query.createdBy = filters.cashierId;
  }
  
  if (filters.cashRegister) {
    query.cashRegister = filters.cashRegister;
  }
  if (Array.isArray(filters.branchIds)) {
    applyBranchScope(query, 'branch', filters.branchIds);
  }
  
  const sales = await Model.find(query)
    .populate('createdBy', 'name userName')
    .populate('customer', 'name nombre')
    .populate('company', 'name')
    .sort({ createdAt: -1 })
    .exec();
    
  return sales;
}

function isInRange(value, filters) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (filters.startDate && date < parseReportDate(filters.startDate)) return false;
  if (filters.endDate && date > parseReportDate(filters.endDate, true)) return false;
  return true;
}

async function listSaleOperationsForReports(filters = {}) {
  const sales = await listSalesForReports(filters);
  const hasRange = Boolean(filters.startDate || filters.endDate);
  const operations = [];

  sales.forEach(sale => {
    const raw = sale.toObject();
    if (!hasRange || isInRange(sale.createdAt, filters)) {
      operations.push({ ...raw, operationType: 'sale', operationDate: sale.createdAt });
    }
    if (sale.refundInfo?.refundedAt && (!hasRange || isInRange(sale.refundInfo.refundedAt, filters))) {
      operations.push({
        ...raw,
        _id: `refund-${sale._id}`,
        operationType: 'refund',
        operationDate: sale.refundInfo.refundedAt,
        createdBy: sale.refundInfo.refundedBy || sale.createdBy,
        cashRegister: sale.refundInfo.cashRegister || sale.cashRegister,
        shift: sale.refundInfo.shift || sale.shift
      });
    }
  });

  return operations.sort((left, right) =>
    new Date(right.operationDate).getTime() - new Date(left.operationDate).getTime());
}

async function getSalesSummaryWithHistoricalData(filters = {}) {
  const sales = await listSalesForReports(filters);
  
  const summary = {
    totalSales: 0,
    totalRevenue: 0,
    totalTaxes: 0,
    totalDiscount: 0,
    salesCount: sales.length,
    refundsCount: 0,
    averageTicket: 0,
    salesWithHistoricalData: 0,
    salesWithoutHistoricalData: 0
  };
  
  sales.forEach(sale => {
    const isRefund = sale.refund;
    const multiplier = isRefund ? -1 : 1;
    
    if (isRefund) {
      summary.refundsCount += 1;
    }
    
    summary.totalRevenue += (sale.finalTotal || sale.total || 0) * multiplier;
    summary.totalTaxes += (sale.totalTaxes || 0) * multiplier;
    summary.totalDiscount += (sale.couponDiscount || 0) + (sale.promotionDiscount || 0);
    
    // Verificar si tiene datos históricos
    if (sale.hasHistoricalData && sale.hasHistoricalData()) {
      summary.salesWithHistoricalData += 1;
    } else {
      summary.salesWithoutHistoricalData += 1;
    }
  });
  
  summary.averageTicket = summary.salesCount > 0 ? 
    summary.totalRevenue / summary.salesCount : 0;
  
  return {
    summary,
    sales,
    filters
  };
}

async function updateSell(sellId, sell, companyId) {
  const foundSale = await Model.findOne({
    _id: sellId,
    company: companyId,
  });

  if (!foundSale) {
    throw new Error('Sale not found');
  }

  const { refund = false } = sell;

  if (refund) {
    foundSale.refund = refund;
  }

  foundSale.updated = true;
  foundSale.updatedAt = new Date();

  return foundSale.save();
}

async function removeSell(sellId, companyId) {
  const foundSale = await Model.findOne({
    _id: sellId,
    company: companyId,
  });

  if (!foundSale) {
    throw new Error('Sale not found');
  }

  foundSale.disable = true;

  return foundSale.save();
}

async function migrateOldSalesToHistoricalFormat() {
  try {
   
    const oldSales = await Model.find({
      $or: [
        { products: { $exists: false } },
        { products: { $size: 0 } },
        { 'products.priceSnapshot': { $exists: false } }
      ],
      oldProducts: { $exists: true, $ne: [] }
    }).populate('oldProducts');
    
    console.log(`Found ${oldSales.length} sales to migrate`);
    
    const migrationResults = [];
    
    // eslint-disable-next-line no-restricted-syntax
    for (const sale of oldSales) {
      try {
    
        migrationResults.push({
          saleId: sale.id,
          status: 'needs_manual_migration',
          productsCount: sale.oldProducts?.length || 0
        });
      } catch (error) {
        migrationResults.push({
          saleId: sale.id,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return {
      totalFound: oldSales.length,
      results: migrationResults
    };
    
  } catch (error) {
    throw new Error(`Migration error: ${error.message}`);
  }
}

module.exports = {
  add: addSell,
  list: listSales,
  update: updateSell,
  remove: removeSell,
  getSaleById, 
  listSalesForReports, 
  getSalesSummaryWithHistoricalData, 
  migrateOldSalesToHistoricalFormat ,
  findByIdempotencyKey,
  listSaleOperationsForReports,
  pageSaleOperations: require('./reportPage')
};
