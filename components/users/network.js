const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const passportConfig = require('../../passport');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const router = express.Router();

const addUser = function (req, res) {
  const user = req.body;
  const companyId = Helper.getCompanyId(req);
  user.companyId = companyId;
  controller
    .addUser(user)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const logout = function (req, res) {
  controller
    .logout(req)
    .then(data => {
      response.success(req, res, data, 201);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const listUsers = function (req, res) {
  const { userId } = req.params;
  const companyId = Helper.getCompanyId(req);
  controller
    .listUsers(userId, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const updateUser = function (req, res) {
  const { userId } = req.params;
  const user = req.body;
  const companyId = Helper.getCompanyId(req);
  user.companyId = companyId;
  controller
    .updateUser(userId, user)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeUser = function (req, res) {
  const { userId } = req.params;
  controller
    .removeUser(userId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', passportConfig.isAuth, listUsers);
router.get('/:userId', passportConfig.isAuth, listUsers);
router.post('/', addUser);
router.post('/login', controller.login);
router.post('/register', controller.register, authenticateToken, requireRole(['admin']));
router.post('/logout', passportConfig.isAuth, logout);
router.patch('/:userId', passportConfig.isAuth,authenticateToken, requireRole(['admin']), updateUser);
router.delete('/:userId', passportConfig.isAuth,authenticateToken, requireRole(['admin']), removeUser);

module.exports = router;