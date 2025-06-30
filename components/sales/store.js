const Model = require('./model');

function addSell(sell) {
  const newSales = new Model(sell);
  return newSales.save();
}

function listSales(sellId, companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (sellId) {
      filter = {
        _id: sellId,
      };
    }
    filter.company = companyId;
    filter.disable = false;
    
    Model.find(filter)
      .populate('products.product') 
      .populate('customer')
      .populate('createdBy')
      .populate('company')
      .exec((err, populated) => {
        if (err) {
          reject(err);
          return false;
        }
        resolve(populated);
        return true;
      });
  });
}

async function updateSell(sellId, sell) {
  const foundSell = await Model.findOne({
    _id: sellId,
  });
  
  if (!foundSell) {
    throw new Error('Venta no encontrada');
  }


  const { 
    refund = false, 
    total, 
    amountPaid, 
    change, 
    paymentMethod,
    products 
  } = sell;
  
  if (refund) {
    foundSell.refund = refund;
  }
  
 
  if (total !== undefined) foundSell.total = total;
  if (amountPaid !== undefined) foundSell.amountPaid = amountPaid;
  if (change !== undefined) foundSell.change = change;
  if (paymentMethod) foundSell.paymentMethod = paymentMethod;
  if (products) foundSell.products = products;
  
  foundSell.updated = true;
  foundSell.updatedAt = new Date();
  
  return foundSell.save();
}

async function removeSell(sellId) {
  const foundSell = await Model.findOne({
    _id: sellId,
  });
  
  if (!foundSell) {
    throw new Error('Venta no encontrada');
  }
  
  foundSell.disable = true;
  foundSell.updated = true;
  foundSell.updatedAt = new Date();
  
  return foundSell.save();
}

module.exports = {
  add: addSell,
  list: listSales,
  update: updateSell,
  remove: removeSell,
};