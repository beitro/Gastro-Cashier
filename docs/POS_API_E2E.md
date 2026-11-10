# POS Transaction API E2E (Development Only)

This test exercises the API transaction path using an isolated Neon development tenant. It must never be pointed at production.

## Target

- Neon project: `billowing-pond-35727408`
- Neon branch: `gastro-test-seed` (`br-fancy-lake-be3pr6o9`)
- Database: `Gastro Cashier`
- Tenant slug: `gastro-ci-test-20261110`
- Outlet slug: `ci-test-outlet`
- Test staff: `pos-e2e@gastro.test`
- Fixture table: `01`
- Fixture menu SKU: `food-4` (no modifiers)

## Prepare fixtures

Apply `db/fixtures/dev-pos-e2e.sql` only to the development branch above. The SQL refuses to seed if the expected tenant/outlet is absent and inserts fixture categories, menu, and tables idempotently.

Provision a test PIN outside source control:

```sh
ALLOW_DEV_FIXTURE_PROVISIONING=true \
POS_E2E_PIN=1234 \
DATABASE_URL='(development owner URL)' \
npm run db:provision-pos-e2e-staff
```

Use a fresh non-production PIN and keep it in the local environment only. Never place it in GitHub source or production secrets.

## Run the API flow

After the development API is configured with its HMAC secret and a least-privilege runtime role:

```sh
POS_E2E_API_URL='(development preview URL)' \
POS_E2E_PIN='(development PIN)' \
npm run test:e2e:pos
```

The test performs PIN login, reads the table/menu catalogs, opens a table session, submits one order, settles cash payment with a stable receipt response, and verifies the table is available again. Each run creates a closed test transaction and receipt; it does not delete transaction history.

## Known API/UI scope

- Menu and table identifiers are resolved to database UUIDs by the API adapter.
- The order modal uses the authenticated API menu catalog.
- Modifier selections are rejected until the backend persists and validates modifier prices.
- Payment First remains disabled until the backend supports payment-first/partial-payment sessions.
- Inventory stock is not yet supplied/enforced by the menu API; the current test catalog is not a stock-control implementation.
- The E2E command requires the development API's HMAC/runtime-role configuration. Do not bypass those startup checks to run the test.


## Development branch security prerequisites

For legacy development branches whose schema predates the canonical baseline, apply
`db/migrations/003_auth_support_tables.sql` before
`db/migrations/003_staff_admin_management.sql` and
`db/migrations/004_signed_rls_context.sql`. The support migration creates the
persistent staff-session and auth-rate-limit tables idempotently and enables
forced RLS on staff credentials. Missing signed context must remain default-deny.

Do not enable staff mutations or remove the emergency HTTP 423 guard until all
of the following are verified on the same development branch:
- `app_private.rls_context_keys` contains the provisioned HMAC key (key material
  is never committed or printed).
- The API runtime uses the same `RLS_CONTEXT_HMAC_SECRET` and a dedicated
  `gastro_runtime` login with `NOSUPERUSER NOBYPASSRLS NOINHERIT`, no ownership,
  and no privileged role memberships.
- Narrow staff/membership DML grants and signed owner-only RLS policies are
  tested for owner allow, cashier/finance deny, and cross-tenant/outlet deny.
- The admin create/update API tests and POS transaction E2E pass.

The development migration does not authorize production changes, merge, or
deployment.
