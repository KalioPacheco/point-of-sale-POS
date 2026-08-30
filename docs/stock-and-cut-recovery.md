# Stock adjustments and cut recovery

## Deployment and compatibility

- MongoDB must support transactions (replica set or sharded cluster), as already required by checkout/refunds.
- Deploy the backend before the frontend. Existing add/reduce/set endpoints and response fields remain available.
- A new `stockAdjustments` collection records keyed operation results. Its native unique `_id` index enforces uniqueness; no legacy history backfill or new unique index on old records is needed. The application database user needs the normal collection-creation permission.
- `cashRegisterShifts.operationRevision` is an internal write fence. `$inc` initializes missing legacy values; no data migration is required for this field.
- No existing stock, history or cut data is rewritten on deployment.

## Stock API

`PUT /products/:productId/stock/add`, `/reduce`, and `/set` commit Product and StockHistory together. Actor comes from the authenticated user, including set. Quantity must be a finite JSON number; add/reduce require positive values, set allows zero.

Send a stable `Idempotency-Key` header (1-200 characters) for every logical operation, including retries after a lost response. A successful retry returns the original result. Reusing a key with another payload or actor returns 409. A rolled-back operation does not reserve the key. Preserve the key until the outcome is known.

For backward compatibility the header is optional. Unkeyed legacy clients retain atomic writes but cannot safely replay a successful request whose response was lost. The official stock form supplies and reuses a key while the pending attempt is retained in the page; page reload is not durable draft recovery.

For `/set`, send `expectedStock` from the observed product. A mismatch returns 409 instead of overwriting intervening changes. Without this field the server protects against in-flight transaction conflicts, but cannot detect that the client opened an old form. This is a value precondition, not a historical revision token.

The correction covers add/reduce/set for product stock. Variant CRUD and direct catalog editing are not redesigned here. Do not treat this document as certification of every inventory mutation path.

## Cut API and partial-state recovery

`POST /cashregistercuts/create` retains manager/admin authorization and derives the company and approver from the session. Cut calculation, counter allocation, cut persistence and shift finalization use one transaction.

Concurrent checkout, refund and shift-bound manual movement creation write the same shift inside their transaction. Closing therefore includes an operation committed before the boundary or rejects an operation after it. A repeated approval for a completed shift returns its existing cut, even after an HTTP response was lost. It never replaces a completed cut's declared cash with a new request amount.

If an old cut exists while its shift is still pending/open, an authorized retry recalculates the cut from persisted operations and completes that same cut/shift atomically. Preserve a backup and inspect the target before using this recovery on operational data. No bulk repair is run automatically.

Read-only inventory of mismatched references/statuses in the explicitly selected database:

```javascript
db.cashRegisterShifts.aggregate([
  { $lookup: { from: 'cashRegisterCuts', localField: '_id', foreignField: 'shift', as: 'cuts' } },
  { $match: { $or: [
    { cutStatus: { $ne: 'completed' }, 'cuts.0': { $exists: true } },
    { cutStatus: 'completed', 'cuts.0': { $exists: false } },
    { cutStatus: 'completed', cut: { $exists: false } }
  ] } },
  { $project: { company: 1, cashRegister: 1, status: 1, cutStatus: 1, cut: 1, 'cuts._id': 1 } }
]);
```

For each candidate verify company, cashier, closing cash, sale/refund records and whether the cut is disabled. Retry only the intended company/shift through the authenticated endpoint. A completed shift with a missing/mismatched cut reference is deliberately rejected rather than guessed; investigate and reconcile it separately. This query is a starting inventory, not an exhaustive consistency validator.

## Regression checks

- `npm run check` in both repositories.
- `npm run test:e2e` with `DB_CONECTION_DEV` explicitly pointing to a disposable local replica set. The suite creates/drops a unique `pos_e2e_*` database; never substitute operational credentials casually.
- Cases include concurrent stock additions, keyed replay, rollback on history failure, stale set, tenant/roles, failure after cut save, concurrent approvals, legacy partial recovery, and sale/refund/manual movement racing a cut.

These checks do not replace QA deployment verification, printer/scanner testing, or load measurement with many terminals. The shift fence serializes writes per register shift, not across the whole tenant.
