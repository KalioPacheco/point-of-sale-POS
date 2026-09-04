const mongoose = require('mongoose');
const Sale = require('./model');
const { pageOptions, dateRange } = require('../../helpers/query');

module.exports = async function reportPage(filters) {
  if (!mongoose.Types.ObjectId.isValid(filters.companyId)) throw new Error('Company required');
  const { page, limit, skip } = pageOptions(filters);
  const range = dateRange(filters);
  const match = { company: new mongoose.Types.ObjectId(filters.companyId), disable: false };
  if (range) match.$or = [{ createdAt: range }, { 'refundInfo.refundedAt': range }];
  const operationMatch = {};
  if (range) operationMatch.operationDate = range;
  if (filters.cashRegister) operationMatch.cashRegister = filters.cashRegister;
  if (filters.cashierId) {
    if (!mongoose.Types.ObjectId.isValid(filters.cashierId)) throw new Error('Invalid cashier');
    operationMatch.createdBy = new mongoose.Types.ObjectId(filters.cashierId);
  }
  const isSale = { $eq: ['$operationType', 'sale'] };
  const amount = { $ifNull: ['$finalTotal', { $ifNull: ['$total', 0] }] };
  const units = { $sum: '$products.quantity' };
  const [data] = await Sale.aggregate([
    { $match: match },
    { $set: { operations: { $concatArrays: [
      [{ type: 'sale', date: '$createdAt', actor: '$createdBy', register: '$cashRegister' }],
      { $cond: [{ $ifNull: ['$refundInfo.refundedAt', false] },
        [{ type: 'refund', date: '$refundInfo.refundedAt', actor: { $ifNull: ['$refundInfo.refundedBy', '$createdBy'] }, register: { $ifNull: ['$refundInfo.cashRegister', '$cashRegister'] } }], []] }
    ] } } },
    { $unwind: '$operations' },
    { $set: { operationType: '$operations.type', operationDate: '$operations.date', createdBy: '$operations.actor', cashRegister: '$operations.register' } },
    { $match: operationMatch },
    { $sort: { operationDate: -1, _id: -1, operationType: 1 } },
    { $facet: {
      items: [{ $skip: skip }, { $limit: limit }, { $project: { operations: 0 } }],
      summary: [{ $group: {
        _id: null, total: { $sum: 1 },
        totalVentas: { $sum: { $cond: [isSale, 1, 0] } },
        totalDevoluciones: { $sum: { $cond: [isSale, 0, 1] } },
        unidadesBrutas: { $sum: { $cond: [isSale, units, 0] } },
        unidadesDevueltas: { $sum: { $cond: [isSale, 0, units] } },
        grossRevenue: { $sum: { $cond: [isSale, amount, 0] } },
        totalIngresos: { $sum: { $multiply: [amount, { $cond: [isSale, 1, -1] }] } }
      } }],
      topProducts: [
        { $unwind: '$products' },
        { $group: { _id: '$products.priceSnapshot.name',
          cantidad: { $sum: { $multiply: ['$products.quantity', { $cond: [isSale, 1, -1] }] } },
          total: { $sum: { $multiply: [{ $ifNull: ['$products.total', 0] }, { $cond: [isSale, 1, -1] }] } }
        } },
        { $sort: { cantidad: -1, _id: 1 } }, { $limit: 5 }
      ]
    } }
  ]);
  const raw = data.summary[0] || {};
  const summary = {
    totalVentas: raw.totalVentas || 0, totalDevoluciones: raw.totalDevoluciones || 0,
    unidadesBrutas: raw.unidadesBrutas || 0, unidadesDevueltas: raw.unidadesDevueltas || 0,
    totalProductosVendidos: (raw.unidadesBrutas || 0) - (raw.unidadesDevueltas || 0),
    totalIngresos: raw.totalIngresos || 0,
    promedioVenta: raw.totalVentas ? raw.grossRevenue / raw.totalVentas : 0
  };
  const items = await Sale.populate(data.items, [{ path: 'createdBy', select: 'name userName' }, { path: 'customer', select: 'name nombre' }]);
  items.forEach(item => { if (item.operationType === 'refund') item._id = `refund-${item._id}`; });
  return { items, total: raw.total || 0, page, limit, summary, topProducts: data.topProducts };
};
