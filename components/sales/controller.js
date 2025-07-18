const store = require('./store');

function addSell(sell) {
  if (!sell) {
    return Promise.reject(`Sell data is empty. User: ${JSON.stringify(sell)}`);
  }

  return store.add(sell);
}

function listSales(sellId, companyId) {
  return store.list(sellId, companyId);
}

function updateSell(sellId, sell) {
  if (!sellId || !sell) {
    return Promise.reject(
      `companyId or company is undefined. userId is: ${sellId}, user is: ${JSON.stringify(
        sell,
      )}`,
    );
  }
  return store.update(sellId, sell);
}

function removeSell(sellId) {
  if (!sellId) {
    return Promise.reject('companyId is undefined');
  }
  return store.remove(sellId);
}

function createSalePOS(saleData) {
  if (!saleData) {
    return Promise.reject('Sale data is required');
  }

  if (!saleData.items || saleData.items.length === 0) {
    return Promise.reject('Sale must have at least one item');
  }

  if (!saleData.paymentMethod) {
    return Promise.reject('Payment method is required');
  }

  for (let i = 0; i < saleData.items.length; i += 1) {
    const item = saleData.items[i];
    if (!item.productId) {
      return Promise.reject('Each item must have a productId');
    }
    if (!item.quantity || item.quantity <= 0) {
      return Promise.reject('Each item must have a positive quantity');
    }
  }

  const validPaymentMethods = ['efectivo', 'tarjeta', 'mixto'];
  if (!validPaymentMethods.includes(saleData.paymentMethod)) {
    return Promise.reject('Invalid payment method. Use: efectivo, tarjeta, or mixto');
  }

  if (saleData.paymentMethod === 'efectivo') {
    if (!saleData.paymentDetails || !saleData.paymentDetails.cashReceived) {
      return Promise.reject('Cash received amount is required for cash payments');
    }
    if (saleData.paymentDetails.cashReceived <= 0) {
      return Promise.reject('Cash received must be positive');
    }
  }

  if (saleData.paymentMethod === 'tarjeta') {
    if (!saleData.paymentDetails || !saleData.paymentDetails.cardType) {
      return Promise.reject('Card type is required for card payments');
    }
  }

  if (saleData.paymentMethod === 'mixto') {
    if (!saleData.paymentDetails || 
        (!saleData.paymentDetails.cashAmount && !saleData.paymentDetails.cardAmount)) {
      return Promise.reject('Cash and card amounts are required for mixed payments');
    }
  }

  return store.createSalePOS(saleData);
}

function generateTicketPOS(saleId) {
  if (!saleId) {
    return Promise.reject('Sale ID is required');
  }
  
  return store.generateTicketPOS(saleId);
}
function generateTicketPDF(saleId) {
  if (!saleId) {
    return Promise.reject('Sale ID is required');
  }
  
  return store.generateTicketPDF(saleId);
}

module.exports = {

  addSell,
  listSales,
  updateSell,
  removeSell,
  createSalePOS,
  generateTicketPOS,
  generateTicketPDF,
};