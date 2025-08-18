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
    .populate('products')
    .populate('createdBy')
    .populate('company')
    .exec();
    
  return sales;
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

module.exports = {
  add: addSell,
  list: listSales,
  update: updateSell,
  remove: removeSell
};