# Database migrations

Migrations are append-only, idempotent and recorded in the `_migrations` collection.
They never guess a company, cashier, shift or payment for ambiguous historical data.

## Commands

```bash
npm run migrate:status
npm run migrate:plan
npm run migrate:up
```

`migrate:up` is a dry run unless `--apply` is provided. Applying also requires the
target database name as an explicit safety confirmation:

```bash
MIGRATION_CONFIRM_DB=pos npm run migrate:up -- --apply
```

Use `MIGRATION_DATABASE_URL` to target a migration database without changing the
normal runtime connection. Always create a backup and run `migrate:plan` first.
Exit code `2` means safe changes were applied but ambiguous records still need
manual remediation before production.
