const express = require('express');
const response = require('../../network');
const controller = require('./controller');
const Helper = require('../../helpers');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { requireCompanyScope } = require('../../middleware/tenant');

const router = express.Router();
const auth = [authenticateToken, requireCompanyScope];

function handle(req, res, promise, status = 200) {
  promise.then(data => response.success(req, res, data, status)).catch((error) => {
    response.error(req, res, error.message || 'Error de caja', error.status || 500, error);
  });
}

router.get('/', ...auth, (req, res) => handle(req, res, controller.list(req.companyId, req.user, req.query.branchId)));
router.get('/:cashRegisterId', ...auth, (req, res) => handle(req, res, controller.get(req.params.cashRegisterId, req.companyId, req.user)));
router.post('/', ...auth, requireRole(['admin']), (req, res) => {
  handle(req, res, controller.add(req.body, req.companyId, Helper.getUserId(req)), 201);
});
router.patch('/:cashRegisterId', ...auth, requireRole(['admin']), (req, res) => {
  handle(req, res, controller.update(req.params.cashRegisterId, req.body, req.companyId, Helper.getUserId(req)));
});

module.exports = router;
