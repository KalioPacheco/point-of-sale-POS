const PDFDocument = require('pdfkit'); 
const Model = require('./model');
const ProductModel = require('../products/model');

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

async function createSalePOS(saleData) {
  try {
    console.log('Creating new POS sale (simplified):', saleData);


    if (!saleData.items || saleData.items.length === 0) {
      throw new Error('Sale must have at least one item');
    }

    if (!saleData.paymentMethod) {
      throw new Error('Payment method is required');
    }


    const timestamp = Date.now();
    const saleNumber = `${saleData.cashRegister || 'CAJA-1'}-${timestamp}`;

    console.log(' Processing items and verifying stock...');
    const processedItems = [];
    let subtotal = 0;

    for (let i = 0; i < saleData.items.length; i += 1) {
      const item = saleData.items[i];
      console.log(` Processing item: ${item.productId}`);
      
      // eslint-disable-next-line no-await-in-loop
      const product = await ProductModel.findById(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      let stockAvailable = 0;
      let unitPrice = 0;
      let productName = '';

      if (item.variantId && product.hasVariants) {
     
        const variant = product.variants.id(item.variantId);
        if (!variant) {
          throw new Error(`Variant not found: ${item.variantId}`);
        }
        if (!variant.active) {
          throw new Error(`Variant is not active: ${variant.name}`);
        }

        stockAvailable = variant.stock || 0;
        unitPrice = variant.price || product.price;
        productName = `${product.name} - ${variant.name}`;
        processedItems.push({
          product: product._id, // eslint-disable-line no-underscore-dangle
          variant: {
            variantId: variant._id, // eslint-disable-line no-underscore-dangle
            name: variant.name,
            attributes: variant.attributes
          },
          productName,
          quantity: item.quantity,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
          stockReduced: false
        });
      } else {
        stockAvailable = product.stock || 0;
        unitPrice = product.price;
        productName = product.name;

        processedItems.push({
          product: product._id, // eslint-disable-line no-underscore-dangle
          productName,
          quantity: item.quantity,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
          stockReduced: false
        });
      }

      if (stockAvailable < item.quantity) {
        throw new Error(`Insufficient stock for ${productName}. Available: ${stockAvailable}, Requested: ${item.quantity}`);
      }

      subtotal += unitPrice * item.quantity;
    }

    console.log('Stock verification passed');

    const newSale = new Model({ 
      total: subtotal + (saleData.taxes || 0),
      change: 0,
      refund: false,
      products: processedItems.map(item => item.product), 
      saleNumber,
      cashRegister: saleData.cashRegister || 'CAJA-1',
      itemsPOS: processedItems,
      subtotal,
      taxes: saleData.taxes || 0,
      paymentMethod: saleData.paymentMethod,
      paymentDetails: saleData.paymentDetails || {},
      status: 'completed',
      createdBy: saleData.userId,
      company: saleData.companyId,
      customerName: saleData.customerName,
      ticket: {
        cashierName: saleData.cashierName,
        storeName: saleData.storeName || 'tiendita ',
        storeAddress: saleData.storeAddress,
        taxId: saleData.taxId
      }
    });

    if (newSale.calculateTotal) {
      newSale.calculateTotal();
    }

    const savedSale = await newSale.save();
    console.log(` Sale saved: ${saleNumber}`);
    console.log('Reducing stock for sold items...');
    
    for (let i = 0; i < processedItems.length; i += 1) {
      const item = processedItems[i];
      // eslint-disable-next-line no-await-in-loop
      const product = await ProductModel.findById(item.product);
      if (item.variant && item.variant.variantId) {
        const variant = product.variants.id(item.variant.variantId);
        const oldStock = variant.stock || 0;
        variant.stock = oldStock - item.quantity;
        variant.updatedAt = new Date();
        
        console.log(` Variant stock reduced: ${item.productName} - ${oldStock} → ${variant.stock}`);
      } else {
        const oldStock = product.stock || 0;
        product.stock = oldStock - item.quantity;
        
        console.log(`Product stock reduced: ${item.productName} - ${oldStock} → ${product.stock}`);
      }

      product.updated = true;
      product.updatedAt = new Date();
      // eslint-disable-next-line no-await-in-loop
      await product.save();
      savedSale.itemsPOS[i].stockReduced = true;
    }
    await savedSale.save();

    console.log(` POS Sale created successfully: ${saleNumber}`);

    return {
      success: true,
      sale: {
        id: savedSale._id, // eslint-disable-line no-underscore-dangle
        saleNumber: savedSale.saleNumber,
        cashRegister: savedSale.cashRegister,
        total: savedSale.total,
        paymentMethod: savedSale.paymentMethod,
        itemCount: savedSale.itemsPOS.length,
        status: savedSale.status
      },
      message: `Sale ${saleNumber} completed successfully`
    };

  } catch (error) {
    console.error(' Error creating POS sale:', error);
    throw error;
  }
}

async function generateTicketPOS(saleId) {
  const sale = await Model.findById(saleId)
    .populate('itemsPOS.product', 'name price description')
    .populate('createdBy', 'userName name')
    .populate('company', 'name')
    .exec();

  if (!sale) {
    throw new Error('Sale not found');
  }
  
  const ticket = {

    storeName: sale.ticket?.storeName || 'tiendita',
    storeAddress: sale.ticket?.storeAddress || 'direccion:XXXXXXX',
    taxId: sale.ticket?.taxId || 'RFC: XXXX000000XXX',
    

    saleNumber: sale.saleNumber,
    date: sale.createdAt.toLocaleDateString('es-MX'),
    time: sale.createdAt.toLocaleTimeString('es-MX'),
    cashRegister: sale.cashRegister,
    cashier: sale.ticket?.cashierName || sale.createdBy?.userName,
    items: sale.itemsPOS && sale.itemsPOS.length > 0 
      ? sale.itemsPOS.map(item => ({
          name: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.totalPrice
        }))
      : [{
          name: 'Venta legacy',
          quantity: 1,
          unitPrice: sale.total,
          total: sale.total
        }],
    

    subtotal: sale.subtotal || sale.total,
    taxes: sale.taxes || 0,
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    cashReceived: sale.paymentDetails?.cashReceived,
    change: sale.paymentDetails?.change || sale.change,
    customerName: sale.customerName
  };

  if (!sale.ticket) {
    sale.ticket = {};
  }
  sale.ticket.printed = true;
  sale.ticket.printedAt = new Date();
  await sale.save();

  return ticket;
}

async function generateTicketPDF(saleId, res) {
  const ticketData = await generateTicketPOS(saleId);

  const doc = new PDFDocument({ size: [226, 841], margin: 10 });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="ticket-${saleId}.pdf"`);
  doc.pipe(res);

  doc.fontSize(12).text(ticketData.storeName, { align: 'center' });
  doc.fontSize(8).text(ticketData.storeAddress, { align: 'center' });
  doc.text(ticketData.taxId, { align: 'center' });
  doc.text('================================', { align: 'center' });
  doc.moveDown(0.5);

  doc.text(`Venta: ${ticketData.saleNumber}`);
  doc.text(`Fecha: ${ticketData.date} ${ticketData.time}`);
  doc.text(`Caja: ${ticketData.cashRegister}`);
  doc.text(`Cajero: ${ticketData.cashier}`);
  doc.text('================================');
  doc.moveDown(0.3);


  ticketData.items.forEach(item => {
    doc.text(`${item.quantity}x ${item.name}`, 10, doc.y, { width: 140 });
    doc.text(`${item.total.toLocaleString()}`, 150, doc.y - 10, { width: 66, align: 'right' });
    if (item.quantity > 1) {
      doc.fontSize(7).text(`    ${item.unitPrice.toLocaleString()} c/u`, 10, doc.y);
      doc.fontSize(8);
    }
    doc.moveDown(0.2);
  });

  doc.text('--------------------------------');
  doc.text('Subtotal:', 10, doc.y, { width: 140 });
  doc.text(`${ticketData.subtotal.toLocaleString()}`, 150, doc.y - 10, { width: 66, align: 'right' });

  if (ticketData.taxes > 0) {
    doc.text('Impuestos:', 10, doc.y, { width: 140 });
    doc.text(`${ticketData.taxes.toLocaleString()}`, 150, doc.y - 10, { width: 66, align: 'right' });
  }

  doc.text('--------------------------------');
  doc.fontSize(10);
  doc.text('TOTAL:', 10, doc.y, { width: 140 });
  doc.text(`${ticketData.total.toLocaleString()}`, 150, doc.y - 10, { width: 66, align: 'right' });
  doc.fontSize(8);
  doc.text('================================');
  doc.moveDown(0.3);


  if (ticketData.paymentMethod === 'efectivo') {
    doc.text('EFECTIVO:', 10, doc.y, { width: 140 });
    doc.text(`${ticketData.cashReceived.toLocaleString()}`, 150, doc.y - 10, { width: 66, align: 'right' });
    
    if (ticketData.change > 0) {
      doc.text('CAMBIO:', 10, doc.y, { width: 140 });
      doc.text(`${ticketData.change.toLocaleString()}`, 150, doc.y - 10, { width: 66, align: 'right' });
    }
  } else if (ticketData.paymentMethod === 'tarjeta') {
    doc.text('PAGO CON TARJETA', { align: 'center' });
  } else if (ticketData.paymentMethod === 'mixto') {
    doc.text('PAGO MIXTO', { align: 'center' });
  }

  doc.text('================================');
  doc.moveDown(0.5);

  if (ticketData.customerName) {
    doc.text(`Cliente: ${ticketData.customerName}`);
    doc.moveDown(0.3);
  }

  doc.fontSize(7);
  doc.text('¡Gracias por su compra!', { align: 'center' });
  doc.text('Conserve su ticket', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(6);
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, { align: 'center' });

  doc.end();
}


module.exports = {
  add: addSell,
  list: listSales,
  update: updateSell,
  remove: removeSell,
  createSalePOS,
  generateTicketPOS,
  generateTicketPDF,
};