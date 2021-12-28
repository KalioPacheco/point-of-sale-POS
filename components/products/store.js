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
  } = product;

  if (name) {
    founProduct.name = name;
  }
  if (photo) {
    founProduct.photo = name;
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

  founProduct.updated = true;
  founProduct.updatedAt = new Date();

  return founProduct.save();
}

async function removeProduct(productId) {
  const foundBrand = await Model.findOne({
    _id: productId,
  });

  foundBrand.disable = true;

  return foundBrand.save();
}

module.exports = {
  add: addProduct,
  list: listProducts,
  update: updateProduct,
  remove: removeProduct,
};
