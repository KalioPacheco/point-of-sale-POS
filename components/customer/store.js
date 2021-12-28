const Model = require('./model');

function addCustomer(customer) {
  const newCustomer = new Model(customer);
  return newCustomer.save();
}

function listCustomer(customerId, companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (customerId) {
      filter = {
        _id: customerId,
      };
    }

    filter.company = companyId;
    filter.disable = false;

    Model.find(filter)
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

async function updateCustomer(customerId, customer) {
  const foundCustomer = await Model.findOne({
    _id: customerId,
  });

  const {
    name = '',
    lastNames = '',
    description = '',
    photo = '',
    address = {},
  } = customer;

  if (name) {
    foundCustomer.name = name;
  }
  if (lastNames) {
    foundCustomer.lastNames = lastNames;
  }
  if (description) {
    foundCustomer.description = description;
  }
  if (photo) {
    foundCustomer.photo = photo;
  }
  if (address) {
    foundCustomer.address = {
      ...foundCustomer.address,
      number: {
        ...foundCustomer.address.number,
        ...address.number,
      },
      geoPoint: {
        ...foundCustomer.address.geoPoint,
        ...address.geoPoint,
      },
    };
  }

  foundCustomer.updated = true;
  foundCustomer.updatedAt = new Date();

  return foundCustomer.save();
}

async function removeCustomer(customerId) {
  const foundCustomer = await Model.findOne({
    _id: customerId,
  });

  foundCustomer.disable = true;

  return foundCustomer.save();
}

module.exports = {
  add: addCustomer,
  list: listCustomer,
  update: updateCustomer,
  remove: removeCustomer,
};
