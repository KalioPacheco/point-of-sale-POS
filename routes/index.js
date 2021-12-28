require('express');
const brand = require('../components/brands/network');
const products = require('../components/products/network');
const users = require('../components/users/network');
const userTypes = require('../components/userTypes/network');
const companies = require('../components/companies/network');
const sales = require('../components/sales/network');
const categories = require('../components/categories/network');
const customer = require('../components/customer/network');

const routes = function (server) {
  server.use('/brands', brand);
  server.use('/products', products);
  server.use('/users', users);
  server.use('/userTypes', userTypes);
  server.use('/companies', companies);
  server.use('/sales', sales);
  server.use('/categories', categories);
  server.use('/customer', customer);
};

module.exports = routes;
