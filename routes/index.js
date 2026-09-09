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
const taxes = require('../components/taxes/network');
const coupons = require('../components/coupons/network');
const cashRegisterShifts = require('../components/cashRegisterShifts/network');
const suppliers = require('../components/suppliers/network');
const inventory = require('../components/inventory/network');
const branches = require('../components/branches/network');
const cashRegisters = require('../components/cashRegisters/network');
const promotions = require('../components/promotions/network');
const response = require('../network');

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
  server.use('/taxes', taxes);
  server.use('/coupons', coupons);
  server.use('/cash-register-shifts', cashRegisterShifts);
  server.use('/suppliers', suppliers);
  server.use('/inventory', inventory);
  server.use('/branches', branches);
  server.use('/cash-registers', cashRegisters);
  server.use('/promotions', promotions);

  server.use((err, req, res, _next) => {
    console.error('Error:', err);
    response.error(req, res, err, 500, err);
  });
};

module.exports = routes;
