const CASH_MOVEMENT_TYPES = Object.freeze([
  'sale',
  'expense',
  'withdrawal',
  'income',
  'initial_cash',
  'change_denomination',
  'refund',
  'other',
]);

const CASH_MOVEMENT_TYPE_ALIASES = Object.freeze({
  entrada: 'initial_cash',
  salida: 'expense',
});

const CASH_MOVEMENT_IN_TYPES = Object.freeze(['sale', 'initial_cash', 'income']);
const CASH_MOVEMENT_OUT_TYPES = Object.freeze(['expense', 'withdrawal', 'refund']);

const CASH_MOVEMENT_TYPE_DESCRIPTIONS = Object.freeze({
  sale: 'Venta',
  expense: 'Gasto',
  withdrawal: 'Retiro',
  income: 'Ingreso de efectivo',
  initial_cash: 'Efectivo Inicial',
  change_denomination: 'Cambio de Denominacion',
  refund: 'Devolucion',
  other: 'Otro',
});

const normalizeCashMovementType = (type) => CASH_MOVEMENT_TYPE_ALIASES[type] || type;

module.exports = {
  CASH_MOVEMENT_TYPES,
  CASH_MOVEMENT_TYPE_ALIASES,
  CASH_MOVEMENT_IN_TYPES,
  CASH_MOVEMENT_OUT_TYPES,
  CASH_MOVEMENT_TYPE_DESCRIPTIONS,
  normalizeCashMovementType,
};
