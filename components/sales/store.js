const mongoose = require('mongoose');
const Model = require('./model');

function addSell(sell) {
  const newSales = new Model(sell);
  return newSales.save();
}

async function listSales(sellId, companyId) {
  const filter = {};
  
  if (sellId) {
    filter.id = sellId;
  }

  if (companyId && companyId !== 'default-company-id') {
    if (mongoose.Types.ObjectId.isValid(companyId)) {
      filter.company = companyId;
    }
  }

  filter.disable = false;


  const sales = await Model.find(filter)
    .populate('createdBy')
    .populate('company')
    .exec();
    
  return sales;
}

async function getSaleById(saleId) {
  const sale = await Model.findById(saleId)
    .populate('createdBy')
    .populate('company')
    .exec();
    
  return sale;
}


async function listSalesForReports(filters = {}) {
  const query = { disable: false };
  
 
  if (filters.startDate && filters.endDate) {
    query.createdAt = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  } else if (filters.date) {
    const startOfDay = new Date(filters.date);
    const endOfDay = new Date(filters.date);
    endOfDay.setHours(23, 59, 59, 999);
    
    query.createdAt = {
      $gte: startOfDay,
      $lte: endOfDay
    };
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
  
  const sales = await Model.find(query)
    .populate('createdBy', 'name userName')
    .populate('company', 'name')
    .sort({ createdAt: -1 })
    .exec();
    
  return sales;
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
    summary.totalDiscount += (sale.couponDiscount || 0);
    
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

async function updateSell(sellId, sell) {
  const foundSale = await Model.findOne({
    _id: sellId,
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

async function removeSell(sellId) {
  const foundSale = await Model.findOne({
    _id: sellId,
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
};