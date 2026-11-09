# Neon PostgreSQL setup (safe mode)

This repository has a PostgreSQL 15 baseline in `schema.sql`. The current React UI still persists operational state in browser `localStorage`; adding a Neon connection does **not** automatically migrate the UI or make multiple devices share state. The API added in this phase is intentionally limited to health checks until domain endpoints and authorization are implemented.

## 1. Inspect the Neon database first

In Neon Console, select the intended project, branch, database, and role. Copy the **pooled** connection string. Do not share it in chat, commit it, or put it in a `VITE_*` variable.

Set `DATABASE_URL` in the server's secret/environment configuration. For local development, put it in an ignored `.env` file (never commit it).

## 2. Read-only inspection

Install dependencies and inspect the target:

```bash
npm install
npm run db:check
```

The command only reads database metadata and lists public tables. If it reports existing public objects, stop and review them. Do not run the baseline migration on a database with existing tables or business data.

## 3. Apply only to a confirmed empty database

`schema.sql` is a fresh-install baseline, not an incremental migration. Only after verifying the selected Neon branch/database is the intended empty target and taking any required backup:

```bash
CONFIRM_EMPTY_DATABASE_MIGRATION=YES npm run db:migrate
```

The migration command refuses to run without the explicit confirmation variable and refuses to apply the baseline if it finds existing public tables, views, materialized views, or sequences. It never drops or truncates objects.

For an unknown or non-empty database, create a separate empty Neon database/branch and migrate there first. Do not reset the existing database.

## 4. Start the API and verify connectivity

```bash
npm run server
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/db
```

The database health endpoint returns database name, role, and PostgreSQL version, but never credentials. Keep the API behind the hosting platform's HTTPS ingress.

## 5. Runtime security requirements before real POS traffic

- Use a dedicated runtime role, not the Neon owner role, for application queries.
- The runtime role must not own protected tables and must not have `BYPASSRLS`.
- Every request must authenticate a staff member and verify tenant/outlet membership on the server.
- Set `app.tenant_id` and `app.outlet_id` transaction-locally with `set_config(..., true)` after authorization.
- Use SQL transactions and row locks for session batch allocation and stock deduction.
- Make payment and stock mutation endpoints idempotent.
- Cancellation stock returns must require manager approval and write an immutable audit event.
- Never expose the database URL to browser code.

## Current implementation boundary

This phase adds a PostgreSQL connection pool, read-only inspection, guarded baseline migration, a minimal API health endpoint, and CI migration verification. It does **not** yet replace localStorage or expose POS write endpoints. That requires a separate domain API migration with authorization and concurrency tests; do not point the live UI at Neon until that phase is complete.
