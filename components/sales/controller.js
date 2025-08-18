const store = require('./store');


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


async function processSaleWithCoupon(saleData) {
  try {

    const taxCalculation = await calculateSaleTaxes(saleData.products, saleData.companyId);
    
    let couponResult = null;
    if (saleData.couponCode) {
      const couponsController = require('../coupons/controller'); // eslint-disable-line global-require
      
      const saleForCoupon = {
        subtotal: taxCalculation.subtotal,
        total: taxCalculation.total,
        products: saleData.products,
        saleId: saleData.id || 'temp'
      };
      
      couponResult = await couponsController.applyCoupon(
        saleData.couponCode,
        saleData.companyId,
        saleForCoupon,
        saleData.customerId
      );
      
      if (!couponResult.success) {
        return Promise.reject(new Error(couponResult.error));
      }
    }
    
    const finalSaleData = {
      ...saleData,
      subtotal: taxCalculation.subtotal,
      totalTaxes: taxCalculation.totalTaxes,
      total: taxCalculation.total,
      couponCode: couponResult?.coupon?.code || null,
      couponDiscount: couponResult?.discount?.discountAmount || 0,
      couponId: couponResult?.coupon?.id || null,
      finalTotal: taxCalculation.total - (couponResult?.discount?.discountAmount || 0)
    };
    
    return finalSaleData;
    
  } catch (error) {
    return Promise.reject(new Error(`Error processing sale with coupon: ${error.message}`));
  }
}

async function validateCouponForSale(couponCode, companyId, products, customerId = null) {
  try {
   
    const taxCalculation = await calculateSaleTaxes(products, companyId);
    
    const saleForValidation = {
      subtotal: taxCalculation.subtotal,
      total: taxCalculation.total,
      products
    };
    
    const couponsController = require('../coupons/controller'); // eslint-disable-line global-require
    
    return await couponsController.validateCoupon(
      couponCode,
      companyId,
      saleForValidation,
      customerId
    );
    
  } catch (error) {
    return Promise.reject(new Error(`Error validating coupon: ${error.message}`));
  }
}


async function addSell(sell) {
  if (!sell) {
    return Promise.reject(new Error(`Sell data is empty. User: ${JSON.stringify(sell)}`));
  }

  try {

    const processedSale = await processSaleWithCoupon(sell);
    return store.add(processedSale);
    
  } catch (error) {
    return Promise.reject(new Error(`Error adding sale: ${error.message}`));
  }
}

module.exports = {
  addSell,
  listSales,
  updateSell,
  removeSell,
  calculateSaleTaxes,
  processSaleWithCoupon,
  validateCouponForSale
};