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

async function updateCustomer(customerId, customer, companyId) {
  const foundCustomer = await Model.findOne({
    _id: customerId,
    company: companyId,
    disable: false,
  });

  if (!foundCustomer) {
    throw new Error('Customer not found');
  }

  const {
    name,
    lastNames,
    email,
    phone,
    rfc,
    description,
    photo,
    address,
  } = customer;

  if (typeof name === 'string' && name.trim()) {
    foundCustomer.name = name.trim();
  }

  if (typeof lastNames === 'string') {
    foundCustomer.lastNames = lastNames.trim();
  }

  if (typeof email === 'string') {
    foundCustomer.email = email.trim().toLowerCase();
  }

  if (typeof phone === 'string') {
    foundCustomer.phone = phone.trim();
  }

  if (typeof rfc === 'string') {
    foundCustomer.rfc = rfc.trim().toUpperCase();
  }

  if (typeof description === 'string') {
    foundCustomer.description = description.trim();
  }

  if (typeof photo === 'string') {
    foundCustomer.photo = photo;
  }

  if (typeof address === 'string') {
    foundCustomer.address = {
      ...(foundCustomer.address || {}),
      street: address,
    };
  }

  if (address && typeof address === 'object') {
    foundCustomer.address = {
      ...(foundCustomer.address || {}),
      ...address,
      number: {
        ...((foundCustomer.address && foundCustomer.address.number) || {}),
        ...(address.number || {}),
      },
      geoPoint: {
        ...((foundCustomer.address && foundCustomer.address.geoPoint) || {}),
        ...(address.geoPoint || {}),
      },
    };
  }

  foundCustomer.updated = true;
  foundCustomer.updatedAt = new Date();

  return foundCustomer.save();
}

async function removeCustomer(customerId, companyId) {
  const foundCustomer = await Model.findOne({
    _id: customerId,
    company: companyId,
    disable: false,
  });

  if (!foundCustomer) {
    throw new Error('Customer not found');
  }

  foundCustomer.disable = true;
  foundCustomer.updated = true;
  foundCustomer.updatedAt = new Date();

  return foundCustomer.save();
}

module.exports = {
  add: addCustomer,
  list: listCustomer,
  update: updateCustomer,
  remove: removeCustomer,
};
