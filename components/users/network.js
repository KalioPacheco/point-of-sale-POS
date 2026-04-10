const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const Helper = require('../../helpers');
const {
  authenticateToken,
  requireRole
} = require('../../middleware/auth');
const {
  validateUserCreate,
  validateUserUpdate
} = require('../../middleware/validation');
const router = express.Router();

const addUser = function (req, res) {
  const user = req.body;
  const companyId = Helper.getCompanyId(req);
  if (!companyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  const createdBy = Helper.getUserId(req);
  user.companyId = companyId;
  user.createdBy = createdBy;
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
  if (!companyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
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
  if (!companyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  user.companyId = companyId;
  controller
    .updateUser(userId, user, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

const removeUser = function (req, res) {
  const { userId } = req.params;
  const companyId = Helper.getCompanyId(req);
  if (!companyId) {
    return response.error(req, res, 'Company scope is required', 403, 'Missing company in token');
  }
  controller
    .removeUser(userId, companyId)
    .then(product => {
      response.success(req, res, product, 200);
    })
    .catch(err => {
      response.error(req, res, 'Internal error', 500, err);
    });
};

router.get('/', authenticateToken, requireRole(['admin']), listUsers);
router.get('/:userId', authenticateToken, requireRole(['admin']), listUsers);
router.post('/', authenticateToken, requireRole(['admin']), validateUserCreate, addUser);
router.post('/login', controller.login);
router.post('/register', authenticateToken, requireRole(['admin']), controller.register);
router.post('/logout', authenticateToken, logout);
router.patch('/:userId', authenticateToken, requireRole(['admin']), validateUserUpdate, updateUser);
router.delete('/:userId', authenticateToken, requireRole(['admin']), removeUser);

module.exports = router;
