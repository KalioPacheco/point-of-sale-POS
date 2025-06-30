const store = require('./store');

function processSellData(sell) {

  if (sell.products && Array.isArray(sell.products) && sell.products[0]?.subtotal) {
    return sell;
  }

  if (sell.products && Array.isArray(sell.products) && typeof sell.products[0] === 'string') {
    return sell;
  }

  if (sell.products && Array.isArray(sell.products)) {
    let total = 0;
    const processedProducts = sell.products.map(item => {
      if (item.product && item.quantity && item.unitPrice) {
        const itemSubtotal = item.quantity * item.unitPrice;
        total += itemSubtotal;
        return {
          product: item.product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: itemSubtotal
        };
      }
      return item;
    });

    return {
      ...sell,
      products: processedProducts,
      total: sell.total || total,
      change: sell.amountPaid ? (sell.amountPaid - (sell.total || total)) : sell.change || 0
    };
  }

  return sell;
}


function addSell(sell) {
  if (!sell) {
    return Promise.reject(`Sell data is empty. User: ${JSON.stringify(sell)}`);
  }

  const processedSell = processSellData(sell);
  return store.add(processedSell);
}


function generateSale(saleData) {
  if (!saleData) {
    return Promise.reject('Los datos de la venta son requeridos');
  }

  const { customer, products, createdBy, company, amountPaid, paymentMethod = 'cash' } = saleData;


  if (!products || products.length === 0) {
    return Promise.reject('Los productos son requeridos');
  }
  if (!createdBy) {
    return Promise.reject('El usuario que crea la venta es requerido');
  }
  if (!company) {
    return Promise.reject('La empresa es requerida');
  }
  if (!amountPaid || amountPaid <= 0) {
    return Promise.reject('El monto pagado debe ser mayor a 0');
  }

  try {

    let total = 0;
    const processedProducts = products.map(item => {
      if (!item.product || !item.quantity || !item.unitPrice) {
        throw new Error('Cada producto debe tener: product, quantity, unitPrice');
      }
      
      const itemSubtotal = item.quantity * item.unitPrice;
      total += itemSubtotal;
      
      return {
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: itemSubtotal
      };
    });

    if (amountPaid < total) {
      return Promise.reject(`El monto pagado (${amountPaid}) es menor al total (${total})`);
    }

    const change = amountPaid - total;

    
    const newSale = {
      customer,
      products: processedProducts,
      total,
      amountPaid,
      change,
      paymentMethod,
      createdBy,
      company
    };

    return store.add(newSale);
  } catch (error) {
    return Promise.reject(error.message);
  }
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

module.exports = {
  addSell,
  generateSale, 
  listSales,
  updateSell,
  removeSell,
};