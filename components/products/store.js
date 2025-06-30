const Model = require('./model');

function addProduct(product) {
  const newProduct = new Model(product);
  return newProduct.save();
}

function listProducts(productId, companyId) {
  return new Promise((resolve, reject) => {
    let filter = {};
    if (productId) {
      filter = {
        _id: productId,
      };
    }

    filter.company = companyId;
    filter.disable = false;

    Model.find(filter)
      .populate('brand')
      .populate('company')
      .populate('createdBy')
      .populate('categories')
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

async function updateProduct(productId, product) {
  const founProduct = await Model.findOne({
    _id: productId,
  });

  const {
    name = '',
    photo = '',
    price = '',
    brand = '',
    description = '',
    stock = '',
    minSell = {},
    unit = '',
  } = product;

  if (name) {
    founProduct.name = name;
  }
  if (photo) {
    founProduct.photo = photo; 
  }
  if (price) {
    founProduct.price = price;
  }
  if (brand) {
    founProduct.brand = brand;
  }
  if (description) {
    founProduct.description = description;
  }
  if (stock) {
    founProduct.stock = stock;
  }
  if (minSell) {
    founProduct.minSell = {
      ...founProduct.minSell,
      ...minSell,
    };
  }
  if (unit) {
    founProduct.unit = unit;
  }

  founProduct.updated = true;
  founProduct.updatedAt = new Date();

  return founProduct.save();
}

async function removeProduct(productId) {
  const foundProduct = await Model.findOne({
    _id: productId,
  });

  foundProduct.disable = true;

  return foundProduct.save();
}

// funcion para agregar piezas 
async function addPieces(productId, piecesData) {
  try {
    const foundProduct = await Model.findOne({
      _id: productId,
      disable: false
    });

    if (!foundProduct) {
      throw new Error('Product not found or disabled');
    }
    const previousStock = foundProduct.stock || 0;
    
    const newStock = previousStock + piecesData.quantity;

    const historyEntry = {
      quantity: piecesData.quantity,
      type: 'entrada',
      reason: piecesData.reason,
      addedBy: piecesData.addedBy,
      addedAt: new Date(),
      previousStock,
      newStock
    };

    foundProduct.stock = newStock;
    foundProduct.stockHistory = foundProduct.stockHistory || [];
    foundProduct.stockHistory.push(historyEntry);
    foundProduct.updated = true;
    foundProduct.updatedAt = new Date();

    const savedProduct = await foundProduct.save();
    
    return {
      success: true,
      product: savedProduct,
      message: `Se agregaron ${piecesData.quantity} piezas. Stock anterior: ${previousStock}, Stock actual: ${newStock}`
    };

  } catch (error) {
    throw new Error(`Error adding pieces: ${error.message}`);
  }
}

// funcion para ver el hitoyial
async function getStockHistory(productId) {
  try {
    const foundProduct = await Model.findOne({
      _id: productId,
      disable: false
    })
    .populate('stockHistory.addedBy', 'name email') 
    .select('name stock stockHistory');

    if (!foundProduct) {
      throw new Error('Product not found or disabled');
    }

    return {
      productName: foundProduct.name,
      currentStock: foundProduct.stock,
      history: foundProduct.stockHistory || []
    };

  } catch (error) {
    throw new Error(`Error getting stock history: ${error.message}`);
  }
}




module.exports = {
  add: addProduct,
  list: listProducts,
  update: updateProduct,
  remove: removeProduct,
  addPieces, // nuevas funciones exportadas 
  getStockHistory,    
};
