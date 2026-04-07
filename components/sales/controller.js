const store = require('./store');

async function deductInventoryFromSale(products, saleId, companyId = null) {
  if (!products || !Array.isArray(products) || products.length === 0) {
    return;
  }

  const productsController = require('../products/controller'); // eslint-disable-line global-require
  const reason = `Venta ${saleId}`;

  const itemsToDeduct = await Promise.all(
    products.map(async (item) => {
      const { productId, quantity: qty } = item;
      const quantity = qty || 1;
      if (!productId || quantity < 1) return null;
      const stockInfo = await productsController.getProductStock(productId, companyId);
      if (stockInfo.hasVariants) return null;
      return { productId, quantity };
    })
  );

  const deductedItems = [];

  try {
    // Evita deducciones parciales si uno de los productos falla por stock.
    // eslint-disable-next-line no-restricted-syntax
    for (const item of itemsToDeduct.filter(Boolean)) {
      await productsController.reduceStock(
        item.productId,
        item.quantity,
        null,
        reason,
        companyId
      );

      deductedItems.push(item);
    }
  } catch (error) {
    // Reversa deducciones aplicadas antes del fallo para mantener consistencia.
    await Promise.all(
      deductedItems.map(async ({ productId, quantity }) => {
        try {
          await productsController.addStock(
            productId,
            quantity,
            null,
            `Rollback por falla de inventario en venta ${saleId}`,
            companyId
          );
        } catch (rollbackError) {
          console.error(
            `[inventory-rollback-error] productId=${productId} saleId=${saleId} error=${rollbackError.message}`
          );
        }
      })
    );

    throw error;
  }
}

async function validateSaleStock(products) {
  if (!products || !Array.isArray(products) || products.length === 0) {
    return;
  }

  const productsController = require('../products/controller'); // eslint-disable-line global-require

  const validations = await Promise.all(
    products.map(async (item) => {
      const { productId, quantity: qty } = item;
      const quantity = qty || 1;
      if (!productId || quantity < 1) return null;
      const stockInfo = await productsController.getProductStock(productId);
      if (stockInfo.hasVariants) return null;
      return { name: stockInfo.name, available: stockInfo.stock || 0, quantity };
    })
  );

  const failed = validations.find(
    (v) => v && v.available < v.quantity
  );
  if (failed) {
    throw new Error(
      `Stock insuficiente para "${failed.name}". Disponible: ${failed.available}, solicitado: ${failed.quantity}`
    );
  }
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


async function createProductSnapshots(products) {
  if (!products || !Array.isArray(products)) {
    return Promise.reject(new Error('Products array is required'));
  }

  try {
    const {Product} = require('../products/model'); // eslint-disable-line global-require
    
    const snapshotsPromises = products.map(async (item) => {
      const product = await Product.findById(item.productId)
        .populate('brand', 'name')
        .populate('categories', 'name');
      
      if (!product) {
        throw new Error(`Product with ID ${item.productId} not found`);
      }
      
      const quantity = item.quantity || 1;
      const price = item.price || product.price || 0;
      const subtotal = price * quantity;
      const taxAmount = product.taxExempt ? 0 : (subtotal * (product.taxRate || 0)) / 100;
      const total = subtotal + taxAmount;
      
      return {
        productId: product.id,
        quantity,
        priceSnapshot: {
          name: product.name,
          price,
          cost: product.cost || 0,
          taxRate: product.taxRate || 0,
          taxExempt: product.taxExempt || false,
          snapshotDate: new Date(),
          brand: product.brand?.name || '',
          category: product.categories?.[0]?.name || '',
          sku: product.sku || '',
          description: product.description || ''
        },
        subtotal,
        taxAmount,
        total
      };
    });
    
    return await Promise.all(snapshotsPromises);
    
  } catch (error) {
    return Promise.reject(new Error(`Error creating product snapshots: ${error.message}`));
  }
}

// FUNCIÓN ACTUALIZADA: Calcular impuestos usando snapshots
async function calculateSaleTaxesWithSnapshots(products) {
  if (!products || !Array.isArray(products)) {
    return Promise.reject(new Error('Products array is required'));
  }

  try {
    const productSnapshots = await createProductSnapshots(products);
    
    let subtotal = 0;
    let totalTaxes = 0;
    
    productSnapshots.forEach(item => {
      subtotal += item.subtotal;
      totalTaxes += item.taxAmount;
    });
    
    return {
      subtotal,
      totalTaxes,
      total: subtotal + totalTaxes,
      productSnapshots
    };
    
  } catch (error) {
    return Promise.reject(new Error(`Error calculating taxes with snapshots: ${error.message}`));
  }
}

async function calculateSaleTaxes(products, _companyId) {
  if (!products || !Array.isArray(products)) {
    return Promise.reject(new Error('Products array is required'));
  }

  try {
    const {Product} = require('../products/model'); // eslint-disable-line global-require
    
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
    const taxCalculation = await calculateSaleTaxesWithSnapshots(saleData.products);
    
    let couponResult = null;
    if (saleData.couponCode) {
      const couponsController = require('../coupons/controller'); // eslint-disable-line global-require
      
      const saleForCoupon = {
        subtotal: taxCalculation.subtotal,
        total: taxCalculation.total,
        products: saleData.products
      };
      
      couponResult = await couponsController.validateCoupon(
        saleData.couponCode,
        saleData.companyId,
        saleForCoupon,
        saleData.customerId
      );
      
      if (!couponResult.valid) {
        return Promise.reject(new Error(couponResult.error || 'Cupón no válido'));
      }
    }
    
    const finalSaleData = {
      ...saleData,
      products: taxCalculation.productSnapshots,
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
    const taxCalculation = await calculateSaleTaxesWithSnapshots(products);
    
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

async function addSell(sell, idempotencyKey) {
  if (!sell) {
    return Promise.reject(new Error('Sell data is empty'));
  }

  if (!idempotencyKey) {
    return Promise.reject(new Error('Idempotency key is required'));
  }

  try {
    const existingSale = await store.findByIdempotencyKey(idempotencyKey);

    if (existingSale) {
      return existingSale; 
    }
    const processedSale = await processSaleWithCoupon(sell);

    const saleWithKey = {
      ...processedSale,
      idempotencyKey
    };

    const newSale = await store.add(saleWithKey);

    try {
      await deductInventoryFromSale(newSale.products, newSale.id, sell.companyId);
    } catch (inventoryError) {
      await store.remove(newSale.id);
      const saleError = new Error(
        `Error al descontar inventario: ${inventoryError.message}. La venta fue revertida.`
      );
      saleError.code = inventoryError.code;
      return Promise.reject(saleError);
    }

    return newSale;

  } catch (error) {
    const wrappedError = new Error(`Error adding sale: ${error.message}`);
    wrappedError.code = error.code;
    return Promise.reject(wrappedError);
  }
  
}

// NUEVA FUNCIÓN: Obtener datos históricos de una venta
async function getSaleHistoricalData(saleId) {
  try {
    const sale = await store.getSaleById(saleId);
    if (!sale) {
      throw new Error('Sale not found');
    }
    
    return {
      saleId: sale.id,
      date: sale.createdAt,
      total: sale.total,
      hasHistoricalData: sale.hasHistoricalData(),
      products: sale.getProductsWithHistoricalData()
    };
    
  } catch (error) {
    return Promise.reject(new Error(`Error getting sale historical data: ${error.message}`));
  }
}

module.exports = {
  addSell,
  listSales,
  updateSell,
  removeSell,
  calculateSaleTaxes, 
  calculateSaleTaxesWithSnapshots, 
  processSaleWithCoupon,
  validateCouponForSale,
  createProductSnapshots, 
  getSaleHistoricalData ,
};