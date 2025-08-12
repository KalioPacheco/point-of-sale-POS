const brand = require('../components/brands/network');
const products = require('../components/products/network');
const users = require('../components/users/network');
const userTypes = require('../components/userTypes/network');
const companies = require('../components/companies/network');
const sales = require('../components/sales/network');
const categories = require('../components/categories/network');
const customer = require('../components/customer/network');
const cashRegisterCuts = require('../components/cashRegisterCuts/network');
const cashMovements = require('../components/cashMovements/network'); 
const tickets = require('../components/ticket/network');
const printers = require('../components/printer/network');
const taxes = require('../components/taxes/network');

const routes = function routes(server) {
  server.use('/brands', brand);
  server.use('/products', products);
  server.use('/users', users);
  server.use('/userTypes', userTypes);
  server.use('/companies', companies);
  server.use('/sales', sales);
  server.use('/categories', categories);
  server.use('/customer', customer);
  server.use('/cashregistercuts', cashRegisterCuts);
  server.use('/cash-movements', cashMovements);
  server.use('/tickets', tickets);
  server.use('/printers', printers);
  server.use('/taxes', taxes);
};

module.exports = routes;