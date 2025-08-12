const store = require('./store');

function addSell(sell) {
  if (!sell) {
    return Promise.reject(new Error(`Sell data is empty. User: ${JSON.stringify(sell)}`));
  }

  return store.add(sell);
}

function listSales(sellId, companyId) {
  return store.list(sellId, companyId);
}

function updateSell(sellId, sell) {
  if (!sellId || !sell) {
    return Promise.reject(new Error(
      `companyId or company is undefined. userId is: ${sellId}, user is: ${JSON.stringify(sell)}`
    ));
  }
  return store.update(sellId, sell);
}

function removeSell(sellId) {
  if (!sellId) {
    return Promise.reject(new Error('companyId is undefined'));
  }
  return store.remove(sellId);
}


async function calculateSaleTaxes(products, _companyId) {
  if (!products || !Array.isArray(products)) {
    return Promise.reject(new Error('Products array is required'));
  }

  try {
    const Product = require('../products/model'); // eslint-disable-line global-require
    
    let subtotal = 0;
    let totalTaxes = 0;
    
    const calculations = await Promise.all(products.map(async (item) => {
      const product = await Product.findById(item.productId);
      if (!product) {
        return { subtotal: 0, tax: 0 };
      }
      
      const quantity = item.quantity || 1;
      const price = item.price || product.price || 0;
      const itemSubtotal = price * quantity;
      const itemTax = product.taxExempt ? 0 : (itemSubtotal * (product.taxRate || 0)) / 100;
      
      return {
        subtotal: itemSubtotal,
        tax: itemTax
      };
    }));
    
    calculations.forEach(calc => {
      subtotal += calc.subtotal;
      totalTaxes += calc.tax;
    });
    
    return {
      subtotal,
      totalTaxes,
      total: subtotal + totalTaxes
    };
    
  } catch (error) {
    return Promise.reject(new Error(`Error calculating taxes: ${error.message}`));
  }
}

// ===== EXPORTACIONES COMPLETAS =====
module.exports = {
  // Funciones originales
  addSell,
  listSales,
  updateSell,
  removeSell,
  // Nueva función de impuestos
  calculateSaleTaxes
};