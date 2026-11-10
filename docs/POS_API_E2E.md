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

## KDS and waiter status persistence

The API-backed POS also persists kitchen/bar progress and waiter handoff:
- `PATCH /api/sessions/:sessionId/orders/:itemId` accepts `cookingStatus` (`queue`, `cooking`, `ready`, `handed_off`) and/or `isServed` (boolean).
- The endpoint is tenant/outlet scoped, requires an active/billing session, and locks the session row while updating the item so settlement cannot race the status change.
- The order snapshot returns `served_at`; the UI refreshes from the database after each status change.
- Staff management remains read-only (HTTP 423) independently of POS order status updates.

## Known API/UI scope

- Menu and table identifiers are resolved to database UUIDs by the API adapter.
- The order modal uses the authenticated API menu catalog.
- Modifier selections are rejected until the backend persists and validates modifier prices.
- Payment First remains disabled until the backend supports payment-first/partial-payment sessions.
- Menu-level inventory is enforced by migration `006_menu_stock_and_payment_settlement.sql`. Missing `menu_stock` rows are unlimited stock; rows with `track_stock=true` enforce available quantity atomically.
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
  `gastro_runtime` login with `NOSUPERUSER NOBYPASSRLS`, no ownership,
  and no privileged role memberships.
- Narrow staff/membership DML grants and signed owner-only RLS policies are
  tested for owner allow, cashier/finance deny, and cross-tenant/outlet deny.
- The admin create/update API tests and POS transaction E2E pass.

The development migration does not authorize production changes, merge, or
deployment.


## Development runtime role provisioned

On Neon branch `gastro-test-seed`, `gastro_runtime` now exists as a LOGIN
role created through Neon with the `read_only` access class. Its broad initial
read grants were revoked and replaced with the explicit table/column allowlist
in `scripts/db-provision-runtime-role.mjs`:
- SELECT only on POS lookup/transaction tables and the required staff credential
  columns.
- INSERT/UPDATE only on POS transaction, session, audit and auth-rate-limit
  tables.
- Column-limited INSERT only on `staff_accounts`, `tenant_memberships`, and
  `outlet_memberships` to prepare the owner-only create-staff path. No UPDATE
  on staff or membership records; the HTTP 423 lock remains active.
- No ownership, superuser, BYPASSRLS, CREATEDB, CREATEROLE, replication, schema
  CREATE privilege, or role memberships.

Neon controls role attributes; this role reports `INHERIT`, but has no role
memberships, so it inherits no additional role grants. Do not add memberships.
The role was verified through an actual connection: without a signed context,
staff, menu and table queries returned zero rows under RLS. A negative INSERT
test against `staff_accounts` failed with SQLSTATE 42501 (RLS policy denied
the row), despite the narrowly scoped INSERT column grants.

Before API runtime activation, rotate the role password through Neon and set
the resulting connection string only in the Vercel **Preview** environment as
`DATABASE_URL`. Set a cryptographically random, at-least-32-byte
`RLS_CONTEXT_HMAC_SECRET` in the same Preview environment, and provision the
identical value into `app_private.rls_context_keys` using
`scripts/db-provision-rls-context-key.mjs`. Never commit, log, or paste either
secret into GitHub source. Keep production environment variables untouched.


## Menu stock and settlement E2E

The dedicated transaction audit runner exercises:
- Two separate table sessions competing for a menu SKU with stock = 1; exactly one order must be accepted and the other must receive HTTP 409.
- Replaying the winning order idempotency key must return the original batch without deducting stock twice.
- Manager/Owner cancellation restores stock once only when the original sale movement exists.
- Cash settles immediately. QRIS, card and transfer remain pending until a Manager/Owner/Finance settlement confirmation supplies a provider reference.
- Payment idempotency replay returns the original payment, and settled sessions release their tables.

Run against the isolated Preview API only:

```sh
POS_E2E_API_URL='(development preview URL)' \
POS_E2E_PIN='(development Owner PIN)' \
npm run test:e2e:inventory
```

This E2E uses an Owner credential for the approval actions. The endpoint also authorizes Manager; test the Manager role separately with a real Manager account. Provider references in this test are simulated strings: no live QRIS, card-acquirer, or bank-transfer provider/webhook is configured.

The Bruno collection is in `bruno/Gastro-Cashier`. Import that folder in Bruno, configure the Development environment, log in, then run the stock, order, cancellation and payment requests. For a concurrency test, open two sessions on separate tables, set the same menu stock to 1, and submit the same menu item from two independent request tabs at the same time using different idempotency keys.


## Pending payment void and retry

Authorized Manager/Owner/Finance can void a pending payment with a mandatory reason:
- `PATCH /api/payments/:paymentId/void`
- A successful void changes payment status to `voided`, records the reason in settlement metadata and audit log, and reopens the dining session.
- A settled payment cannot be voided through this endpoint.
- After voiding, Manager/Owner may cancel an eligible order item and restore its stock, or cashier may create a replacement payment.

The automated inventory E2E also verifies transfer pending → void → replacement transfer pending → confirmed settlement.
