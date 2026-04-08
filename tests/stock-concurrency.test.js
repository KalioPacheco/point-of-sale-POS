const test = require('node:test');
const assert = require('node:assert/strict');

function restore(target, key, original) {
    target[key] = original;
}

test('products.store.reduceStock usa filtro atómico con stock >= quantity', async () => {
    const productModel = require('../components/products/model');
    const store = require('../components/products/store');

    const originalFindOneAndUpdate = productModel.Product.findOneAndUpdate;
    const originalCreate = productModel.StockHistory.create;

    const companyId = '507f1f77bcf86cd799439011';
    let receivedFilter;
    let receivedUpdate;

    productModel.Product.findOneAndUpdate = async (filter, update) => {
        receivedFilter = filter;
        receivedUpdate = update;
        return {
            _id: 'p1',
            name: 'Producto A',
            stock: 3,
        };
    };

    productModel.StockHistory.create = async () => ({ id: 'history-1' });

    try {
        await store.reduceStock('p1', 2, 'user-1', 'Venta test', companyId);

        assert.equal(receivedFilter._id, 'p1');
        assert.equal(receivedFilter.disable, false);
        assert.equal(receivedFilter.company, companyId);
        assert.equal(receivedFilter.stock.$gte, 2);
        assert.equal(receivedUpdate.$inc.stock, -2);
        assert.equal(receivedUpdate.$set.updated, true);
    } finally {
        restore(productModel.Product, 'findOneAndUpdate', originalFindOneAndUpdate);
        restore(productModel.StockHistory, 'create', originalCreate);
    }
});

test('simulación concurrente: solo una reducción consume la unidad disponible', async () => {
    const productModel = require('../components/products/model');
    const store = require('../components/products/store');

    const originalFindOneAndUpdate = productModel.Product.findOneAndUpdate;
    const originalFindOne = productModel.Product.findOne;
    const originalCreate = productModel.StockHistory.create;

    let stock = 1;
    let historyWrites = 0;

    productModel.Product.findOneAndUpdate = async (filter, update) => {
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });

        const requested = filter.stock?.$gte || 0;
        if (stock < requested) {
            return null;
        }

        stock += update.$inc.stock;

        return {
            _id: filter._id,
            name: 'Producto Carrera',
            stock,
        };
    };

    productModel.Product.findOne = () => ({
        select: async () => ({
            name: 'Producto Carrera',
            stock,
        }),
    });

    productModel.StockHistory.create = async () => {
        historyWrites += 1;
        return { id: `history-${historyWrites}` };
    };

    try {
        const [first, second] = await Promise.allSettled([
            store.reduceStock('p-race', 1, 'u1', 'Venta 1'),
            store.reduceStock('p-race', 1, 'u2', 'Venta 2'),
        ]);

        const fulfilled = [first, second].filter((result) => result.status === 'fulfilled');
        const rejected = [first, second].filter((result) => result.status === 'rejected');

        assert.equal(fulfilled.length, 1);
        assert.equal(rejected.length, 1);
        assert.equal(rejected[0].reason.code, 'INSUFFICIENT_STOCK');
        assert.equal(stock, 0);
        assert.equal(historyWrites, 1);
    } finally {
        restore(productModel.Product, 'findOneAndUpdate', originalFindOneAndUpdate);
        restore(productModel.Product, 'findOne', originalFindOne);
        restore(productModel.StockHistory, 'create', originalCreate);
    }
});
