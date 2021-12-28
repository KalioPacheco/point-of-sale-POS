const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');

const router = express.Router();

const addType = function (req, res) {
  const type = req.body;
  const companyId = Helper.getCompanyId(req);
  type.companyId = companyId;
  controller
    .addType(type)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listTypes = function (req, res) {
  const { typeId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .listTypes(typeId, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateType = function (req, res) {
  const { typeId } = req.params;
  const type = req.body;
  const companyId = Helper.getCompanyId(req);
  type.companyId = companyId;
  controller
    .updateType(typeId, type)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeType = function (req, res) {
  const { typeId } = req.params;
  controller
    .removeType(typeId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth, listTypes);
router.get('/:typeId', passportConfig.isAuth, listTypes);
router.post('/', passportConfig.isAuth, addType);
router.patch('/:typeId', passportConfig.isAuth, updateType);
router.delete('/:typeId', passportConfig.isAuth, removeType);

module.exports = router;
