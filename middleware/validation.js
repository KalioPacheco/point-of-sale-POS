const { body, validationResult } = require('express-validator'); 

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
  body('categoryId').isInt().withMessage('Categoría inválida'),
  body('brandId').optional().isInt(),
  handleValidationErrors
];

const validateSale = [
  body('customerId').optional().isInt(),
  body('products').isArray().notEmpty().withMessage('Productos requeridos'),
  body('products.*.productId').isInt(),
  body('products.*.quantity').isInt({ min: 1 }),
  handleValidationErrors
];

const validateCustomer = [
  body('name').notEmpty().withMessage('Nombre requerido'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('phone').optional(),
  handleValidationErrors
];

const validateUser = [
  body('username').notEmpty().withMessage('Usuario requerido'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Contraseña mínimo 6 caracteres'),
  body('userTypeId').isInt().withMessage('Tipo de usuario inválido'),
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
  body('type').isIn(['entrada', 'salida']).withMessage('Tipo debe ser entrada o salida'),
  body('amount').isFloat({ min: 0 }).withMessage('Monto debe ser mayor a 0'),
  body('description').notEmpty().withMessage('Descripción requerida'),
  handleValidationErrors
];

const validateCashRegisterCut = [
  body('initialAmount').isFloat({ min: 0 }).withMessage('Monto inicial inválido'),
  body('finalAmount').isFloat({ min: 0 }).withMessage('Monto final inválido'),
  body('cutDate').isISO8601().withMessage('Fecha de corte inválida'),
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
  validateUser,
  validateCompany,
  validateCoupon,
  validateTax,
  validateUserType,
  validateCashMovement,
  validateCashRegisterCut,
  validateTicket,
  handleValidationErrors
};