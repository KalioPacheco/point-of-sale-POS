require('express');
const brand = require('../components/brands/network');
const products = require('../components/products/network');
const users = require('../components/users/network');
const userTypes = require('../components/userTypes/network');
const companies = require('../components/companies/network');
const sales = require('../components/sales/network');

const routes = function (server) {
  server.use('/brands', brand);
  server.use('/products', products);
  server.use('/users', users);
  server.use('/userTypes', userTypes);
  server.use('/companies', companies);
  server.use('/sales', sales);
};

module.exports = routes;
