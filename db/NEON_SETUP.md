# Neon PostgreSQL setup

The repository now contains a PostgreSQL-backed API foundation plus the guarded baseline schema. The API includes server-side PIN/NFC authentication, staff sessions, outlet-scoped table/menu reads, dining sessions, order batches, KDS status updates, and full-session settlement.

**Important boundary:** the React POS screens are not yet fully migrated from localStorage to these endpoints. Refunds, inventory movements, petty cash, finance reporting, multi-outlet selection, and complete runtime-role/RLS validation remain outstanding. Do not treat this as production-ready multi-device POS yet.

## Configure secrets

Use the pooled connection string from the intended Neon project/branch/database. Configure it as server-only `DATABASE_URL`; never use a `VITE_*` variable and never commit it.

For local development, put the connection string in an ignored `.env` file. Set `PGSSL=true` for Neon. Keep `BOOTSTRAP_TOKEN` as a long random secret and remove it after one-time provisioning.

## Read-only inspection

In GitHub repository Settings → Secrets and variables → Actions, optionally add:
- Secret `NEON_DATABASE_URL`: pooled Neon connection string.
- Variable `ENABLE_NEON_READONLY_CHECK=true`.

The Neon workflow runs only a read-only metadata inspection. It does not migrate or modify the hosted database.

Run locally with:

```bash
npm install
npm run db:check
```

If the database contains any public tables, views, materialized views, or sequences, stop and inspect it. Do not apply the fresh-install baseline to an existing database.

## Baseline migration

Only use a separately confirmed empty database/branch, with backups and the target verified:

```bash
CONFIRM_EMPTY_DATABASE_MIGRATION=YES npm run db:migrate
```

The script requires explicit confirmation, takes a PostgreSQL session advisory lock, re-checks the public schema while holding that lock, applies `schema.sql`, and verifies core objects. It never drops or truncates existing objects. This is a clean-install baseline, not an incremental migration.

## API

```bash
npm run start
curl http://localhost:8080/api/health
```

See `server/README.md` for bootstrap and endpoint details. Bearer tokens are currently held in browser localStorage; move to Secure/HttpOnly/SameSite cookies before public deployment.

## Security follow-ups before production

- Finish frontend hydration/mutations through the API; eliminate localStorage as the operational source of truth.
- Complete outlet selection for staff with multiple memberships.
- Implement refunds, inventory ledger movements, petty cash, finance reporting, and manager-approved cancellation/stock return.
- Run runtime-role tests with the exact privileges used by the API. The optional restricted runtime-role provisioning from the earlier foundation is intentionally not enabled here because the current API authentication queries still require staff credential/membership reads.
- Validate every endpoint under a non-owner, non-BYPASSRLS database role with transaction-local tenant/outlet context.
- Add end-to-end tests for authentication, authorization, order concurrency, payment idempotency, and stock transactions.
