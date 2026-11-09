# PostgreSQL 15 database

`schema.sql` is the canonical fresh-install schema for Gastro-Cashier's multi-tenant, multi-outlet model. See [ERD.md](../ERD.md) for relationships and integrity rules.

## Local PostgreSQL 15

```bash
docker compose -f docker-compose.postgres15.yml up -d
```

Or start a standalone instance:

```bash
docker run --name gastro-postgres15 \
  -e POSTGRES_USER=gastro \
  -e POSTGRES_PASSWORD=change-this-local-password \
  -e POSTGRES_DB=gastro_cashier \
  -p 5432:5432 -d postgres:15

psql "postgresql://gastro:change-this-local-password@localhost:5432/gastro_cashier" \
  -v ON_ERROR_STOP=1 -f schema.sql
```

## Runtime contract

- Set `app.tenant_id` and `app.outlet_id` using `set_config(..., true)` inside every database transaction after verifying the staff membership.
- Use a dedicated runtime DB role; do not connect the application as `postgres`, table owner, or a role with `BYPASSRLS`.
- PIN/NFC authentication, session creation, batch allocation, payment settlement, inventory movements, and audit writes must execute on the server in SQL transactions.
- Allocate batch numbers while locking the dining session row with `SELECT ... FOR UPDATE`.
- Make payment endpoints idempotent with the outlet-scoped idempotency key.
- `audit_logs` is append-only. Grant the application role INSERT and SELECT only; deny UPDATE and DELETE.
- Never commit a real `DATABASE_URL`, DB password, PIN, NFC credential, or pepper.

## Reset / overwrite

`schema.sql` is intended for an **empty database**. To replace an existing non-production draft, create a new database and apply this file. Do not run `DROP SCHEMA public CASCADE` against an unknown or production database. For an intentional destructive reset, first take and verify a backup, then run the reset manually against the explicitly selected database.

## Verification

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c '\dt'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT * FROM v_table_board LIMIT 0'
```

GitHub Actions provisions an ephemeral `postgres:15` service for schema smoke tests. It is a CI database, not a persistent production server.
