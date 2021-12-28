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
      .populate('products')
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
  const foundBrand = await Model.findOne({
    _id: sellId,
  });

  const { refund = false } = sell;

  if (refund) {
    foundBrand.refund = refund;
  }

  foundBrand.updated = true;
  foundBrand.updatedAt = new Date();

  return foundBrand.save();
}

async function removeSell(sellId) {
  const foundBrand = await Model.findOne({
    _id: sellId,
  });

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addSell,
  list: listSales,
  update: updateSell,
  remove: removeSell,
};
