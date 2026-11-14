# RLS Trust-Boundary Audit — PR #7

Date: 2026-11-10
Target: `feat/postgres-consolidated` at `c04f46078642e89633d6fb88c36c6cbebca85ab2`

## Status

**NO-GO for production use of the shared runtime database credential until the request-context trust boundary is redesigned.**

This is a code-level finding. No Neon database was modified, no migration was run, and no deployment or secret was changed.

## Finding: runtime-settable custom GUCs are treated as authorization evidence

The runtime role is intentionally non-owner and has `NOSUPERUSER NOBYPASSRLS`, and the policies use transaction-local settings. Those are useful controls against accidental leakage, but they do not make custom PostgreSQL GUC values trustworthy. A session using the runtime credential can call `set_config(...)` for custom settings itself.

The current policies and server code use settings including:

- `app.tenant_id` and `app.outlet_id` for tenant/outlet row visibility and writes;
- `app.auth_lookup` for broad pre-authentication staff credential lookup;
- `app.bootstrap_mode` for bootstrap-only inserts and reads;
- `app.staff_admin` and `app.actor_staff_id` for staff administration;
- `app.auth_rate_limit` for the authentication throttling ledger;
- `app.session_token_hash` for session-row visibility.

The integration test currently sets `app.tenant_id` and `app.outlet_id` directly as the runtime role, then verifies that the corresponding tenant/outlet rows are visible. It tests isolation when the context is honest; it does not test whether the runtime role can forge that context.

### Reproducible negative-test cases

Run only against a disposable CI database. These are test ideas, not commands to run against Neon:

```sql
BEGIN;
SET LOCAL ROLE gastro_runtime;
SELECT set_config('app.tenant_id', '<tenant-B-uuid>', true);
SELECT set_config('app.outlet_id', '<outlet-B-uuid>', true);
-- Current policy predicates trust these values. A successful read is a
-- context-forgery finding, not proof that the caller is a member of tenant B.
SELECT id, tenant_id, outlet_id FROM public.dining_tables;
ROLLBACK;

BEGIN;
SET LOCAL ROLE gastro_runtime;
SELECT set_config('app.auth_lookup', 'true', true);
-- Current staff credential policy treats this caller-set flag as privileged.
SELECT id, pin_hash, nfc_credential_hash FROM public.staff_accounts;
ROLLBACK;

BEGIN;
SET LOCAL ROLE gastro_runtime;
SELECT set_config('app.staff_admin', 'true', true);
SELECT set_config('app.actor_staff_id', '<owner-staff-uuid>', true);
-- The policy trusts these GUC values as admin context.
-- Attempt only in a disposable database with seeded fixtures.
ROLLBACK;
```

## Required redesign before production

Do not replace the GUC checks with a plain `SECURITY DEFINER` function that merely reads the same GUCs. That would preserve the vulnerability.

A viable signed-context design must meet all of these requirements:

1. The application server creates a canonical, versioned context payload only after authenticating the staff session and resolving active tenant/outlet membership and role.
2. The payload includes at minimum tenant ID, outlet ID, actor staff ID, narrowly scoped capabilities, issued-at time, expiry, and a unique request/transaction nonce. Privileged pre-auth/bootstrap operations must use separate, narrowly scoped capability types.
3. The server signs the exact canonical payload with HMAC-SHA-256 using a high-entropy secret held in the API environment. The database verifier uses a separately provisioned copy of that secret; the secret must never be readable by the runtime role.
4. The database stores the verification secret in a private schema/table owned by a non-runtime owner. Runtime must have no table read/write, schema CREATE, function replacement, or ownership privileges there.
5. A database verification function must have a fixed safe `search_path`, a tightly controlled owner, minimal grants, and must validate signature, version, expiry, and required claim shape. RLS policies must derive tenant/outlet/actor/capabilities only from verified claims.
6. Every privileged GUC path must be covered. Signing tenant/outlet only while leaving `auth_lookup`, `bootstrap_mode`, `staff_admin`, or rate-limit bypass flags caller-forgeable is not an acceptable fix.
7. Context must be transaction-local and reset automatically on commit/rollback. Invalid, expired, malformed, replayed (where one-time semantics are required), or missing context must fail closed.
8. Tests must explicitly attempt to forge each capability as the runtime role, including cross-tenant reads/writes, staff credential enumeration, bootstrap inserts, owner/admin mutations, session enumeration/revocation, and rate-limit ledger bypass.
9. The tests must also prove legitimate API flows still work, including PIN/NFC login, logout, owner staff management, and normal POS operations.

## Important implementation caveat

A signed context improves the trust boundary against callers who possess only the database runtime credential, provided the signing secret remains isolated. It does not protect against compromise of the API process or its signing secret. Key rotation, deployment secret provisioning, and bootstrap credential handling must be designed explicitly.

## Current conclusion

- Non-owner / NOLOGIN / NOBYPASSRLS role checks: useful, but insufficient by themselves.
- Tenant/outlet isolation tests: validate honest-context isolation, not resistance to forged context.
- Owner API middleware: necessary, but the database admin policies still trust caller-set GUCs.
- Production readiness: **NO-GO** until the complete capability context is authenticated inside PostgreSQL and the negative tests pass.

## Scope and safety

This audit branch contains documentation only. It does not alter application code, database migrations, CI behavior, GitHub Secrets, Neon, or deployment configuration.
