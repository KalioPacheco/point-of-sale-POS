const Model = require('./model');
const UsersModel = require('../users/model');

const cleanString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeRfc = (value) => cleanString(value).toUpperCase();

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const assertCompanyCanBeDisabled = async (companyId) => {
  const activeUsers = await UsersModel.countDocuments({
    company: companyId,
    disable: false,
  });

  if (activeUsers > 0) {
    throw new Error('No se puede desactivar la empresa porque tiene usuarios activos asignados');
  }
};

const formatAddressForTicket = (address) => {
  if (typeof address === 'string') {
    return cleanString(address);
  }

  if (!address || typeof address !== 'object') {
    return '';
  }

  const street = cleanString(address.street);
  const ext = cleanString(address.number && address.number.ext);
  const int = cleanString(address.number && address.number.int);
  const numberText = [ext, int ? `Int ${int}` : ''].filter(Boolean).join(' ');
  const line1 = [street, numberText].filter(Boolean).join(' ');
  const city = cleanString(address.city);
  const state = cleanString(address.state);
  const country = cleanString(address.country);

  return [line1, city, state, country].filter(Boolean).join(', ');
};

const syncTicketStoreConfigWithCompany = (companyDoc, changes = {}) => {
  const { syncName = false, syncRfc = false, syncAddress = false } = changes;
  if (!syncName && !syncRfc && !syncAddress) {
    return;
  }

  companyDoc.ticketStoreConfig = {
    ...(companyDoc.ticketStoreConfig || {}),
    phone: cleanString(companyDoc.ticketStoreConfig && companyDoc.ticketStoreConfig.phone),
    email: cleanString(companyDoc.ticketStoreConfig && companyDoc.ticketStoreConfig.email),
  };

  if (syncName) {
    companyDoc.ticketStoreConfig.name = cleanString(companyDoc.name);
  }

  if (syncRfc) {
    companyDoc.ticketStoreConfig.taxId = cleanString(companyDoc.rfc);
  }

  if (syncAddress) {
    companyDoc.ticketStoreConfig.address = formatAddressForTicket(companyDoc.address);
  }

  companyDoc.ticketStoreConfig.updatedAt = new Date();
};

function addCompany(company) {
  const topLevelPhone = cleanString(company && company.phone);
  const topLevelEmail = cleanString(company && company.email);

  const payload = {
    ...company,
    name: cleanString(company && company.name),
    rfc: normalizeRfc(company && company.rfc),
  };

  const providedTicketStoreConfig = payload.ticketStoreConfig
    && typeof payload.ticketStoreConfig === 'object'
    ? payload.ticketStoreConfig
    : {};

  payload.ticketStoreConfig = {
    name: cleanString(providedTicketStoreConfig.name) || payload.name,
    address: cleanString(providedTicketStoreConfig.address) || formatAddressForTicket(payload.address),
    phone: cleanString(providedTicketStoreConfig.phone) || topLevelPhone,
    taxId: cleanString(providedTicketStoreConfig.taxId) || payload.rfc,
    email: cleanString(providedTicketStoreConfig.email) || topLevelEmail,
    updatedAt: new Date(),
  };

  const newCompany = new Model(payload);
  return newCompany.save();
}

function listCompanies(companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (companyId) {
      filter = {
        _id: companyId,
      };
    }

    filter.disable = false;

    Model.find(filter)
      .populate('createdBy')
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

async function updateCompany(companyId, type) {
  const foundBrand = await Model.findOne({
    _id: companyId,
    disable: false,
  });

  if (!foundBrand) {
    throw new Error('Empresa no encontrada');
  }

  const { name, rfc, address, disable, phone, email, ticketStoreConfig } = type;

  const shouldSyncName = typeof name === 'string' && name.trim().length > 0;
  const shouldSyncRfc = typeof rfc === 'string';
  const shouldSyncAddress = address !== undefined;
  const hasPhoneInput = hasOwn(type, 'phone') || hasOwn(ticketStoreConfig, 'phone');
  const hasEmailInput = hasOwn(type, 'email') || hasOwn(ticketStoreConfig, 'email');

  const nextPhone = cleanString(hasOwn(ticketStoreConfig, 'phone') ? ticketStoreConfig.phone : phone);
  const nextEmail = cleanString(hasOwn(ticketStoreConfig, 'email') ? ticketStoreConfig.email : email);

  if (shouldSyncName) {
    foundBrand.name = cleanString(name);
  }

  if (typeof rfc === 'string') {
    foundBrand.rfc = normalizeRfc(rfc);
  }

  if (typeof disable === 'boolean') {
    if (disable === true && foundBrand.disable !== true) {
      await assertCompanyCanBeDisabled(foundBrand._id);
    }
    foundBrand.disable = disable;
  }

  if (address !== undefined) {
    if (typeof address === 'string') {
      foundBrand.address = {
        ...(foundBrand.address || {}),
        street: cleanString(address),
      };
    } else if (address && typeof address === 'object') {
      foundBrand.address = {
        ...(foundBrand.address || {}),
        ...address,
        number: {
          ...((foundBrand.address && foundBrand.address.number) || {}),
          ...(address.number || {}),
        },
        geoPoint: {
          ...((foundBrand.address && foundBrand.address.geoPoint) || {}),
          ...(address.geoPoint || {}),
        },
      };
    }
  }

  syncTicketStoreConfigWithCompany(foundBrand, {
    syncName: shouldSyncName,
    syncRfc: shouldSyncRfc,
    syncAddress: shouldSyncAddress,
  });

  foundBrand.ticketStoreConfig = {
    ...(foundBrand.ticketStoreConfig || {}),
    phone: cleanString(foundBrand.ticketStoreConfig && foundBrand.ticketStoreConfig.phone),
    email: cleanString(foundBrand.ticketStoreConfig && foundBrand.ticketStoreConfig.email),
  };

  if (hasPhoneInput) {
    foundBrand.ticketStoreConfig.phone = nextPhone;
  }

  if (hasEmailInput) {
    foundBrand.ticketStoreConfig.email = nextEmail;
  }

  if (hasPhoneInput || hasEmailInput) {
    foundBrand.ticketStoreConfig.updatedAt = new Date();
  }

  foundBrand.updated = true;
  foundBrand.updatedAt = new Date();

  return foundBrand.save();
}

async function removeCompany(companyId) {
  const foundBrand = await Model.findOne({
    _id: companyId,
  });

  if (!foundBrand) {
    throw new Error('Empresa no encontrada');
  }

  await assertCompanyCanBeDisabled(foundBrand._id);

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addCompany,
  list: listCompanies,
  update: updateCompany,
  remove: removeCompany,
};
