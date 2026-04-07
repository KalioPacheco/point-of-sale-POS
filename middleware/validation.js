const { body, validationResult } = require('express-validator');
const { CASH_MOVEMENT_TYPES } = require('../components/cashMovements/types');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: errors.array()
    });
  }
  return next();
};

const validateBrand = [
  body('name').notEmpty().withMessage('Nombre de marca requerido'),
  body('description').optional(),
  handleValidationErrors
];

const validateCategory = [
  body('name').notEmpty().withMessage('Nombre de categoría requerido'),
  body('description').optional(),
  handleValidationErrors
];

const validateProduct = [
  body('name').notEmpty().withMessage('Nombre requerido'),
  body('price').isFloat({ min: 0 }).withMessage('Precio inválido'),
  body('categories')
    .isArray()
    .withMessage('Las categorías deben ser un arreglo'),
  body('categories.*')
    .isMongoId()
    .withMessage('Categoría inválida'),
  body('brand')
    .optional()
    .isMongoId()
    .withMessage('Marca inválida'),
  handleValidationErrors
];

const validateSale = [
  body('customerId').optional().isInt(),
  body('products').isArray().notEmpty().withMessage('Productos requeridos'),
  body('products.*.productId').isMongoId().withMessage('ID de producto inválido'),
  body('products.*.quantity').isInt({ min: 1 }).withMessage('Cantidad debe ser mayor a 0'),
  handleValidationErrors
];

const validateCustomer = [
  body('name').notEmpty().withMessage('Nombre requerido'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('phone').optional(),
  handleValidationErrors
];

const validateUserCreate = [
  body('userName')
    .notEmpty()
    .withMessage('Usuario requerido')
    .isString()
    .withMessage('Usuario inválido')
    .trim(),
  body('password')
    .notEmpty()
    .withMessage('Contraseña requerida')
    .isLength({ min: 6 })
    .withMessage('Contraseña mínimo 6 caracteres'),
  body('userTypeId')
    .optional()
    .isMongoId()
    .withMessage('Tipo de usuario inválido'),
  body('disable')
    .optional()
    .isBoolean()
    .withMessage('Disable debe ser booleano'),
  handleValidationErrors
];

const validateUserUpdate = [
  body('userName')
    .optional()
    .isString()
    .withMessage('Usuario inválido')
    .trim(),
  body('userTypeId')
    .optional()
    .isMongoId()
    .withMessage('Tipo de usuario inválido'),
  body('disable')
    .optional()
    .isBoolean()
    .withMessage('Disable debe ser booleano'),
  handleValidationErrors
];

const validateCompany = [
  body('name').notEmpty().withMessage('Nombre de empresa requerido'),
  body('address').optional(),
  body('phone').optional(),
  body('email').optional().isEmail().withMessage('Email inválido'),
  handleValidationErrors
];

const validateCoupon = [
  body('code').notEmpty().withMessage('Código de cupón requerido'),
  body('discount').isFloat({ min: 0, max: 100 }).withMessage('Descuento debe ser entre 0 y 100'),
  body('expirationDate').isISO8601().withMessage('Fecha de expiración inválida'),
  handleValidationErrors
];

const validateTax = [
  body('name').notEmpty().withMessage('Nombre de impuesto requerido'),
  body('rate').isFloat({ min: 0 }).withMessage('Tasa de impuesto inválida'),
  handleValidationErrors
];

const validateUserType = [
  body('name').notEmpty().withMessage('Nombre de tipo de usuario requerido'),
  body('permissions').optional().isArray(),
  handleValidationErrors
];

const validateCashMovement = [
  body('type')
    .isIn(CASH_MOVEMENT_TYPES)
    .withMessage('Tipo invÃ¡lido'),
  body('amount').isFloat({ min: 0 }).withMessage('Monto debe ser mayor a 0'),
  body('description').notEmpty().withMessage('Descripción requerida'),
  handleValidationErrors
];

const validateCashRegisterCut = [
  body('cashRegister').notEmpty().withMessage('Caja requerida'),
  body('cashierId').notEmpty().withMessage('Cajero requerido'),
  body('shiftStart')
    .isISO8601()
    .withMessage('Fecha inicio inválida'),
  body('shiftEnd')
    .isISO8601()
    .withMessage('Fecha fin inválida'),
  body('actualCash')
    .isFloat({ min: 0 })
    .withMessage('Efectivo inválido'),
  body('initialCash')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monto inicial inválido'),
  handleValidationErrors
];

const validateTicket = [
  body('saleId').isInt().withMessage('ID de venta inválido'),
  body('customerData').optional(),
  handleValidationErrors
];

module.exports = {
  validateBrand,
  validateCategory,
  validateProduct,
  validateSale,
  validateCustomer,
  validateUserCreate,
  validateUserUpdate,
  validateCompany,
  validateCoupon,
  validateTax,
  validateUserType,
  validateCashMovement,
  validateCashRegisterCut,
  validateTicket,
  handleValidationErrors
};
