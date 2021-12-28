const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');

const router = express.Router();

const addCompany = function (req, res) {
  const { company } = req.body;
  controller
    .addCompany(company)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listCompanies = function (req, res) {
  const { companyId } = req.params;
  controller
    .listCompanies(companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateCompany = function (req, res) {
  const { companyId } = req.params;
  const { company } = req.body;
  controller
    .updateCompany(companyId, company)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeCompany = function (req, res) {
  const { companyId } = req.params;
  controller
    .removeCompany(companyId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.post('/', passportConfig.isAuth, addCompany);
router.get('/:companyId', passportConfig.isAuth, listCompanies);
router.patch('/:companyId', passportConfig.isAuth, updateCompany);
router.delete('/:companyId', passportConfig.isAuth, removeCompany);

module.exports = router;
