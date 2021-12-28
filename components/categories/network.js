const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');

const router = express.Router();

const addCategory = function (req, res) {
  const { category } = req.body;
  controller
    .addCategory(category)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listCategories = function (req, res) {
  const { categoryId } = req.params;
  controller
    .listCategories(categoryId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateCategory = function (req, res) {
  const { categoryId } = req.params;
  const { category } = req.body;
  controller
    .updateCategory(categoryId, category)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeCategory = function (req, res) {
  const { categoryId } = req.params;
  controller
    .removeCategory(categoryId)
    .then(data => {
      response.success(req, res, data, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.post('/', passportConfig.isAuth, addCategory);
router.get('/:categoryId', passportConfig.isAuth, listCategories);
router.patch('/:categoryId', passportConfig.isAuth, updateCategory);
router.delete('/:categoryId', passportConfig.isAuth, removeCategory);

module.exports = router;
