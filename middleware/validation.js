const { body, validationResult } = require('express-validator');
const { CASH_MOVEMENT_TYPES } = require('../components/cashMovements/types');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Datos invalidos',
      code: 'VALIDATION_ERROR',
      message: 'La solicitud contiene campos invalidos',
      details: errors.array(),
      body: ''
    });
  }
  return next();
};

const forbiddenTenantFields = [
  body('company').not().exists().withMessage('La empresa se deriva de la sesion'),
  body('companyId').not().exists().withMessage('La empresa se deriva de la sesion'),
  body('createdBy').not().exists().withMessage('El creador se deriva de la sesion')
];

const namedCreate = label => [
  body('name').isString().trim().notEmpty().withMessage(`${label} requerido`),
  body('description').optional().isString(),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const namedUpdate = [
  body('name').optional().isString().trim().notEmpty().withMessage('Nombre invalido'),
  body('description').optional().isString(),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const productFields = optional => [
  body('name')[optional ? 'optional' : 'exists']().isString().trim().notEmpty().withMessage('Nombre requerido'),
  body('price')[optional ? 'optional' : 'exists']().isFloat({ min: 0 }).withMessage('Precio invalido'),
  body('cost').optional().isFloat({ min: 0 }).withMessage('Costo invalido'),
  body('stock').optional().isFloat({ min: 0 }).withMessage('Stock invalido'),
  body('categories')[optional ? 'optional' : 'exists']().isArray().withMessage('Las categorias deben ser un arreglo'),
  body('categories.*').optional().isMongoId().withMessage('Categoria invalida'),
  body('brand').optional({ nullable: true }).isMongoId().withMessage('Marca invalida'),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const validateSale = [
  body('customerId').optional({ nullable: true }).isMongoId(),
  body('products').isArray().notEmpty().withMessage('Productos requeridos'),
  body('products.*.productId').isMongoId().withMessage('ID de producto invalido'),
  body('products.*.variantId').optional({ nullable: true }).isMongoId().withMessage('ID de variante invalido'),
  body('products.*.quantity').isInt({ min: 1 }).withMessage('Cantidad debe ser mayor a 0'),
  body('products.*.price').not().exists().withMessage('El precio es autoritativo del servidor'),
  body('products.*.subtotal').not().exists().withMessage('El subtotal es autoritativo del servidor'),
  body('products.*.taxAmount').not().exists().withMessage('Los impuestos son autoritativos del servidor'),
  body('cashRegister').isString().trim().notEmpty().withMessage('Caja requerida'),
  body('shiftId').isMongoId().withMessage('Turno abierto requerido'),
  body('payment.method').isIn(['cash', 'card', 'transfer', 'mixed']).withMessage('Metodo de pago invalido'),
  body('payment.cashReceived').optional().isFloat({ min: 0 }),
  body('payment.reference').optional().isString().trim(),
  body('payment.cashAmount').optional().isFloat({ min: 0 }),
  body('payment.cardAmount').optional().isFloat({ min: 0 }),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const customerFields = optional => [
  body('name')[optional ? 'optional' : 'exists']().isString().trim().notEmpty().withMessage('Nombre requerido'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email invalido'),
  body('phone').optional().isString(),
  body('rfc').optional().isString(),
  body('address').optional().custom(value => typeof value === 'string' || (value !== null && typeof value === 'object' && !Array.isArray(value))).withMessage('Direccion invalida'),
  body('ticketStoreConfig').optional().isObject(),
  body('ticketStoreConfig.email').optional({ checkFalsy: true }).isEmail(),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const userCommon = [
  body('userTypeId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Tipo de usuario invalido'),
  body('disable').optional().isBoolean().withMessage('Disable debe ser booleano'),
  body('role').optional().isIn(['vendedor', 'manager', 'admin']).withMessage('Rol de usuario invalido'),
  body('name').optional().isString().trim(),
  body('lastNames').optional().isString().trim(),
  ...forbiddenTenantFields
];

const validateUserCreate = [
  body('userName').isString().trim().notEmpty().withMessage('Usuario requerido'),
  body('password').isLength({ min: 6 }).withMessage('Contrasena minimo 6 caracteres'),
  ...userCommon,
  handleValidationErrors
];

const validateUserUpdate = [
  body('userName').optional().isString().trim().notEmpty().withMessage('Usuario invalido'),
  body('password').not().exists().withMessage('Use el flujo de cambio de contrasena'),
  ...userCommon,
  handleValidationErrors
];

const companyFields = optional => [
  body('name')[optional ? 'optional' : 'exists']().isString().trim().notEmpty().withMessage('Nombre de empresa requerido'),
  body('rfc').optional().isString().trim(),
  body('address').optional().custom(value => typeof value === 'string' || (value !== null && typeof value === 'object' && !Array.isArray(value))).withMessage('Direccion invalida'),
  body('ticketStoreConfig').optional().isObject(),
  body('ticketStoreConfig.email').optional({ checkFalsy: true }).isEmail(),
  body('phone').optional().isString(),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email invalido'),
  body('disable').optional().isBoolean(),
  body('company').not().exists().withMessage('La empresa objetivo se deriva de la ruta y sesion'),
  body('companyId').not().exists().withMessage('La empresa objetivo se deriva de la ruta y sesion'),
  body('createdBy').not().exists().withMessage('El creador se deriva de la sesion'),
  handleValidationErrors
];

const couponFields = optional => [
  body('code')[optional ? 'optional' : 'exists']().isString().trim().notEmpty().withMessage('Codigo de cupon requerido'),
  body('name')[optional ? 'optional' : 'exists']().isString().trim().notEmpty().withMessage('Nombre de cupon requerido'),
  body('discountType')[optional ? 'optional' : 'exists']().isIn(['percentage', 'fixed_amount']).withMessage('Tipo de descuento invalido'),
  body('discountValue')[optional ? 'optional' : 'exists']().isFloat({ min: 0 }).custom((value, { req }) => {
    if (optional && !req.body.discountType) {
      throw new Error('discountType es requerido al modificar discountValue');
    }
    if (req.body.discountType === 'percentage' && Number(value) > 100) {
      throw new Error('El porcentaje no puede exceder 100');
    }
    return true;
  }),
  body('expirationDate')[optional ? 'optional' : 'exists']().isISO8601().withMessage('Fecha de expiracion invalida'),
  body('minimumPurchase').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['active', 'inactive', 'expired']),
  body('disable').optional().isBoolean(),
  body('discount').not().exists().withMessage('Use discountValue'),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const taxFields = optional => [
  body('name')[optional ? 'optional' : 'exists']().isString().trim().notEmpty().withMessage('Nombre de impuesto requerido'),
  body('type').optional().isIn(['percentage', 'fixed']).withMessage('Tipo de impuesto invalido'),
  body('defaultRate')[optional ? 'optional' : 'exists']().isFloat({ min: 0 }).withMessage('Tasa de impuesto invalida'),
  body('isActive').optional().isBoolean(),
  body('rate').not().exists().withMessage('Use defaultRate'),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const validateCashMovementCreate = [
  body('type').isIn(CASH_MOVEMENT_TYPES).withMessage('Tipo invalido'),
  body('amount').isFloat({ gt: 0 }).withMessage('Monto debe ser mayor a 0'),
  body('concept').isString().trim().notEmpty().withMessage('Concepto requerido'),
  body('description').optional().isString(),
  body('cashRegister').optional().isString().trim(),
  body('shiftId').optional().isMongoId().withMessage('Turno invalido'),
  body('shiftId').custom((value, { req }) => Boolean(value) === Boolean(req.body.cashRegister))
    .withMessage('Los movimientos de caja requieren turno; los globales omiten caja y turno'),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const validateCashMovementUpdate = [
  body('concept').optional().isString().trim().notEmpty(),
  body('description').optional().isString(),
  body('notes').optional().isString(),
  body('authorized').optional().isBoolean(),
  body('type').not().exists().withMessage('El tipo no puede editarse'),
  body('amount').not().exists().withMessage('El monto no puede editarse'),
  ...forbiddenTenantFields,
  handleValidationErrors
];

const validateCashRegisterCut = [
  body('cashRegister').isString().trim().notEmpty().withMessage('Caja requerida'),
  body('shiftId').isMongoId().withMessage('Turno invalido'),
  body('actualCash').optional().isFloat({ min: 0 }).withMessage('Efectivo invalido'),
  body('notes').optional().isString(),
  ...forbiddenTenantFields,
  handleValidationErrors
];

module.exports = {
  validateBrandCreate: namedCreate('Nombre de marca'),
  validateBrandUpdate: namedUpdate,
  validateCategoryCreate: namedCreate('Nombre de categoria'),
  validateCategoryUpdate: namedUpdate,
  validateProductCreate: productFields(false),
  validateProductUpdate: productFields(true),
  validateSale,
  validateCustomerCreate: customerFields(false),
  validateCustomerUpdate: customerFields(true),
  validateUserCreate,
  validateUserUpdate,
  validateCompanyCreate: companyFields(false),
  validateCompanyUpdate: companyFields(true),
  validateCouponCreate: couponFields(false),
  validateCouponUpdate: couponFields(true),
  validateTaxCreate: taxFields(false),
  validateTaxUpdate: taxFields(true),
  validateUserTypeCreate: namedCreate('Nombre de tipo de usuario'),
  validateUserTypeUpdate: namedUpdate,
  validateCashMovementCreate,
  validateCashMovementUpdate,
  validateCashRegisterCut,
  handleValidationErrors
};
