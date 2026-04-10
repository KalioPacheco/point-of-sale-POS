const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('./store');
const Model = require('./model');

test('createTicket persiste appliedCoupon y lo expone en la respuesta', async (t) => {
  const originalGenerateTicketNumber = Model.generateTicketNumber;
  const originalSave = Model.prototype.save;

  Model.generateTicketNumber = async () => 'SAL-CAJA-1-20260408-0001';
  Model.prototype.save = async function saveStub() {
    return this;
  };

  t.after(() => {
    Model.generateTicketNumber = originalGenerateTicketNumber;
    Model.prototype.save = originalSave;
  });

  const result = await store.createTicket({
    ticketType: 'sale',
    storeInfo: { name: 'Tienda QA' },
    transactionInfo: {
      cashRegister: 'CAJA-1',
      cashier: { name: 'QA' }
    },
    items: [{
      productName: 'Producto QA',
      quantity: 1,
      unitPrice: 100,
      subtotal: 100,
      totalTaxes: 16,
      totalPrice: 116,
      taxes: [{
        name: 'IVA',
        type: 'percentage',
        rate: 16,
        amount: 16
      }]
    }],
    totals: {
      subtotal: 100,
      totalTaxes: 16,
      couponDiscount: 10,
      couponCode: 'PROMO10',
      couponName: 'Promo 10',
      total: 106
    },
    appliedCoupon: {
      couponId: '507f1f77bcf86cd799439011',
      code: 'PROMO10',
      name: 'Promo 10',
      description: 'Descuento QA',
      discountType: 'fixed_amount',
      discountValue: 10,
      discountAmount: 10
    },
    payment: {
      method: 'efectivo',
      details: {
        cashReceived: 120
      }
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.ticket.appliedCoupon.code, 'PROMO10');
  assert.equal(result.ticket.appliedCoupon.discountAmount, 10);
});

test('createTicket omite discountType cuando llega null en appliedCoupon', async (t) => {
  const originalGenerateTicketNumber = Model.generateTicketNumber;
  const originalSave = Model.prototype.save;

  Model.generateTicketNumber = async () => 'SAL-CAJA-1-20260408-0002';
  Model.prototype.save = async function saveStub() {
    return this;
  };

  t.after(() => {
    Model.generateTicketNumber = originalGenerateTicketNumber;
    Model.prototype.save = originalSave;
  });

  const result = await store.createTicket({
    ticketType: 'sale',
    storeInfo: { name: 'Tienda QA' },
    transactionInfo: {
      cashRegister: 'CAJA-1',
      cashier: { name: 'QA' }
    },
    items: [{
      productName: 'Producto QA',
      quantity: 1,
      unitPrice: 100,
      subtotal: 100,
      totalTaxes: 16,
      totalPrice: 116,
      taxes: [{
        name: 'IVA',
        type: 'percentage',
        rate: 16,
        amount: 16
      }]
    }],
    totals: {
      subtotal: 100,
      totalTaxes: 16,
      couponDiscount: 10,
      couponCode: 'PROMO10',
      couponName: 'Promo 10',
      total: 106
    },
    appliedCoupon: {
      couponId: '507f1f77bcf86cd799439011',
      code: 'PROMO10',
      name: 'Promo 10',
      discountType: null,
      discountAmount: 10
    },
    payment: {
      method: 'efectivo',
      details: {
        cashReceived: 120
      }
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.ticket.appliedCoupon.code, 'PROMO10');
  assert.equal(result.ticket.appliedCoupon.discountType, undefined);
});

test('generateTicketData lee cupon desde appliedCoupon', async (t) => {
  const originalFindById = Model.findById;

  Model.findById = () => ({
    populate() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({
        id: 'ticket-1',
        storeInfo: {
          name: 'Tienda QA',
          address: 'Calle 1',
          phone: '',
          email: '',
          taxId: ''
        },
        ticketNumber: 'SAL-CAJA-1-20260408-0001',
        ticketType: 'sale',
        transactionInfo: {
          date: new Date('2026-04-08T12:00:00.000Z'),
          cashRegister: 'CAJA-1',
          cashier: { name: 'QA' },
          customer: {}
        },
        items: [],
        totals: {
          subtotal: 100,
          totalTaxes: 16,
          couponDiscount: 10,
          total: 106
        },
        taxBreakdown: [],
        payment: {
          method: 'efectivo',
          details: { cashReceived: 120, change: 14 }
        },
        appliedCoupon: {
          code: 'PROMO10',
          name: 'Promo 10',
          description: 'Descuento QA',
          discountAmount: 10
        },
        printInfo: { printed: true }
      }).then(resolve, reject);
    }
  });

  t.after(() => {
    Model.findById = originalFindById;
  });

  const data = await store.generateTicketData('ticket-1');

  assert.equal(data.couponCode, 'PROMO10');
  assert.equal(data.couponName, 'Promo 10');
  assert.equal(data.couponDescription, 'Descuento QA');
  assert.equal(data.discountAmount, 10);
});
