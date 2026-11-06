# Gastro-Cashier — Multi-tenant & Hybrid Database Design

- **Status:** Proposed — engineering review required
- **Baseline:** `feat/db-schema-erd` (Claude's 19-table relational model)
- **Target:** Multi-tenant SaaS + Hybrid Local Network Mode (Option C)
- **Database direction:** PostgreSQL per environment; local PostgreSQL is authoritative for outlet transactions while disconnected

## 1. Executive decision

Keep Claude's existing POS domain model as the starting point. Do not replace the transaction, batch, item, modifier, payment, KDS, menu, or recipe concepts. Extend it with explicit tenant/outlet ownership, local-device identity, durable synchronization, auditability, and stock movement history.

The current Claude schema is a useful single-restaurant relational baseline, but it is not yet a multi-tenant schema. Its `restaurant_settings.singleton`, globally unique table numbers, globally unique staff PIN hashes, and lack of tenant/outlet keys are examples of assumptions that must change before SaaS rollout.

This document is a target design and implementation plan. It is **not an executable migration** and does not authorize applying schema changes to production. The current schema and generated ERD/Data Dictionary should remain unchanged until the team validates this design and the migration/backfill strategy.

## 2. Architecture and ownership boundaries

### Tenant and outlet hierarchy

- **Tenant**: the customer business/account that subscribes to Gastro-Cashier.
- **Outlet**: one physical restaurant location owned by exactly one tenant.
- **Local node**: the local server/runtime installed at an outlet.
- **Device**: a cashier terminal, KDS screen, manager terminal, or other trusted client registered to an outlet.
- **Staff account**: an employee identity/profile scoped to a tenant. Outlet access is granted separately.

A tenant can own many outlets. An outlet belongs to exactly one tenant. A local node is assigned to exactly one outlet at a time.

### Data placement

| Data/domain | Ownership scope | Local runtime | Cloud |
| --- | --- | --- | --- |
| Tenant, subscription, billing | Tenant | Cached minimum entitlement | Authoritative |
| Outlet settings, tables, staff access | Outlet / tenant | Authoritative for local operations | Replicated/configuration authority by field policy |
| Menu, modifiers, recipes, discounts | Tenant, optionally outlet overrides later | Cached operational copy | Authoritative configuration |
| Orders, batches, items, KDS state | Outlet | Authoritative during operation/outage | Synchronized copy |
| Payments and payment attempts | Outlet | Durable local record; provider status may be pending/unknown | Reconciliation and consolidated reporting |
| Inventory and stock movements | Outlet | Authoritative during outage | Synchronized copy |
| Audit log | Tenant + outlet + actor | Durable local append | Synchronized copy |
| Outbox/inbox/sync conflicts | Node + outlet | Durable local sync state | Cloud inbox/deduplication and monitoring |

Avoid a single shared mutable record being independently edited in both places. For each domain, document the system of record and conflict policy.

## 3. Proposed entity additions

### Core SaaS entities

| Entity | Purpose | Important attributes / constraints |
| --- | --- | --- |
| `tenants` | Customer business | UUID PK, name, status, created_at |
| `outlets` | Physical restaurant | UUID PK, tenant_id FK, code, name, timezone, status; UNIQUE(tenant_id, code) |
| `tenant_memberships` | User's tenant-level access | tenant_id, user_subject/provider, status, role; unique per identity + tenant |
| `outlet_memberships` | Employee's outlet access | tenant_id, outlet_id, staff_account_id, role/permission assignment |
| `local_nodes` | Registered local server installations | UUID PK, tenant_id, outlet_id, node_key_id, status, last_seen_at, software_version |
| `devices` | Cashier/KDS/manager terminals | UUID PK, tenant_id, outlet_id, device_key_id, device_type, status, last_seen_at |

Identity-provider subject should be the stable external identity key; email alone is not a safe immutable identity. Secrets and device private keys must never be stored in plaintext database columns.

### Durable sync entities

| Entity | Purpose | Important attributes / constraints |
| --- | --- | --- |
| `sync_outbox` | Local events awaiting cloud acknowledgement | event_id UUID PK, tenant_id, outlet_id, node_id, aggregate_type, aggregate_id, event_type, schema_version, payload JSONB, occurred_at, created_at, attempts, next_attempt_at, acknowledged_at |
| `sync_inbox` | Cloud-side idempotency/deduplication | event_id UUID PK (or unique scoped key), tenant_id, outlet_id, received_at, processed_at, result |
| `sync_cursors` | Checkpoint per node/stream | tenant_id, outlet_id, node_id, stream_name, cursor, updated_at |
| `sync_conflicts` | Quarantined conflicts requiring resolution | conflict_id UUID PK, tenant_id, outlet_id, aggregate_type/id, local_version, cloud_version, conflict_type, payloads, status, resolved_by, resolved_at |

Outbox event envelope must include: stable event ID, tenant ID, outlet ID, node ID, aggregate type/ID, event type, schema version, occurred-at timestamp, correlation ID, and payload. Avoid secrets and unnecessary personal data in payloads.

### Operational integrity entities

| Entity | Purpose | Important attributes / constraints |
| --- | --- | --- |
| `inventory_movements` | Append-only stock ledger | movement_id UUID PK, tenant_id, outlet_id, raw_material_id, movement_type, quantity_delta, unit_cost, source_type/id, actor_id, occurred_at, idempotency_key |
| `audit_logs` | Security and business audit trail | audit_id UUID PK, tenant_id, outlet_id nullable for tenant-level action, actor_type/id, action, resource_type/id, request_id, device_id, occurred_at, metadata JSONB |
| `payment_attempts` (or payment-provider fields on payments) | Track external payment lifecycle | provider, provider_reference, idempotency_key, status, requested_at, confirmed_at, failure_code, raw response reference (redacted/minimized) |

Do not make the raw provider response an unrestricted dump of sensitive data. Store only the fields needed for reconciliation and support.

## 4. Scope changes to Claude's existing 19 tables

The following is the intended ownership model. The implementation may use a tenant_id on every tenant-owned table, with outlet_id only where the record is physically outlet-specific. Use composite foreign keys where needed so a child cannot point to a parent from another tenant or outlet.

| Existing table | Target scope | Recommended change |
| --- | --- | --- |
| `restaurant_settings` | Outlet | Replace singleton model with `outlet_settings` keyed by outlet_id; preserve historical settings snapshots on transactions/payments |
| `units` | Global reference or tenant extension | Keep global canonical units initially; add tenant-specific custom units only if product requires it |
| `roles` | Global role templates + tenant assignments | Keep permission definitions centrally; do not let a tenant redefine system permissions by editing global rows |
| `staff_accounts` | Tenant | Add tenant_id; replace globally unique PIN hash with per-tenant/per-account authentication policy |
| `waiters` | Outlet | Add tenant_id + outlet_id; waiter display/name should not be globally unique |
| `dining_tables` | Outlet | Add tenant_id + outlet_id; change UNIQUE(table_number) to UNIQUE(outlet_id, table_number) |
| `raw_materials` | Outlet | Add tenant_id + outlet_id; inventory quantities/cost belong to a location |
| `menu_items` | Tenant | Add tenant_id; optionally add outlet-menu availability/price override join table later |
| `modifier_groups` | Tenant via menu item | Add tenant_id or enforce composite FK through menu_items |
| `modifier_options` | Tenant via modifier group | Enforce parent ownership through composite FK |
| `recipe_ingredients` | Tenant + outlet compatibility | Ensure menu item and raw material belong to same tenant; decide whether recipes are tenant-wide or outlet-specific |
| `discount_rules` | Tenant | Add tenant_id; unique code per tenant, not globally |
| `transactions` | Outlet | Add tenant_id + outlet_id; reference table and waiter through same tenant/outlet |
| `transaction_batches` | Outlet via transaction | Carry tenant_id/outlet_id or enforce scoped composite FK to transactions |
| `payments` | Outlet via transaction | Add tenant_id/outlet_id; unique payment number within outlet or globally generated UUID-based number |
| `transaction_items` | Outlet via transaction | Enforce same tenant/outlet as transaction, batch, menu item, and payment |
| `transaction_item_modifiers` | Outlet via item | Inherit scope through parent transaction item |
| `print_tickets` | Outlet | Add tenant_id/outlet_id; ticket numbering and printer routing are outlet-specific |
| `petty_cash_entries` | Outlet | Add tenant_id/outlet_id; actor must be authorized for that outlet |

For PostgreSQL composite integrity, introduce unique keys such as `UNIQUE (tenant_id, id)` on tenant-owned parents and `UNIQUE (tenant_id, outlet_id, id)` on outlet-owned parents, then reference the full scope tuple from child rows. This is deliberate defense against cross-tenant foreign-key mistakes; application authorization remains mandatory.

## 5. Key constraints and corrections

1. **No globally addressable business rows.** All tenant-owned reads/writes are authorized using authenticated membership and outlet access. Never trust a client-supplied tenant_id or outlet_id as authorization.
2. **Unique constraints must reflect scope.** Examples: table number unique per outlet; staff external subject unique per tenant; menu code/name policy per tenant; payment/ticket number unique per outlet.
3. **Do not use PIN as identity.** A PIN is a local authentication factor, not a globally unique user identifier. Use a staff/account identifier plus a salted, slow password hash (Argon2id/bcrypt with suitable parameters), rate limits, lockout policy, and secure local credential provisioning. HMAC-SHA256 alone is not a password-hashing scheme.
4. **Use server-generated prices.** Continue Claude's recommendation: the backend calculates prices, modifiers, discounts, service charge, PB1, and totals. Client-submitted totals are not trusted.
5. **Preserve transaction snapshots.** Keep item name/category/destination/unit price and modifier names/price deltas on transaction items so later menu edits do not rewrite history.
6. **Payment state must be explicit.** A local payment record is not proof that a QRIS/card provider accepted the payment. Add payment attempt/provider lifecycle and reconciliation. Model pending, succeeded, failed, unknown/timeout, and reversed/refunded states as appropriate.
7. **Inventory must be ledger-backed.** `raw_materials.current_stock` may remain a cached balance, but every receipt, sale deduction, adjustment, waste, transfer, and reversal should create an immutable inventory movement. Balance updates and movement insertion must be atomic.
8. **Audit sensitive operations.** Refund, void, discount override, price override, stock adjustment, role changes, cash adjustments, device registration, and conflict resolution need actor/time/outlet/request context.
9. **Soft deletion and retention.** Do not cascade-delete financial and operational history when a menu, staff member, outlet, or tenant is deactivated. Prefer status/archival and documented retention rules.
10. **Timezone and money.** Store timestamps as timestamptz; keep outlet IANA timezone (e.g. Asia/Jakarta) for business-day boundaries. Continue NUMERIC for IDR amounts; do not use floating-point for money.

## 6. Hybrid Local Network Mode — transaction and sync rules

### Local transaction rule

For a POS command, the local API performs one PostgreSQL transaction that writes business rows and the corresponding outbox event atomically. If the business transaction rolls back, no event is emitted. If it commits, the event is durable even when internet is unavailable.

### Sync delivery rule

- Local worker delivers events over authenticated TLS when connectivity returns.
- Cloud processes each event idempotently using event_id plus tenant/outlet/node scope.
- Cloud validates node registration, tenant/outlet assignment, event schema/version, authorization, and aggregate rules.
- Acknowledgement is persisted locally only after cloud acceptance.
- Transient failures retry with exponential backoff and jitter; permanent validation failures go to a dead-letter/quarantine state.
- Event ordering is guaranteed per aggregate (for example, a single transaction), not assumed globally.
- Cloud-to-local configuration updates need their own version/cursor and signed/validated payload policy.

### Conflict policy

Avoid last-write-wins for financial and stock data. Use domain-specific rules:
- Orders/payments: append-only events and explicit reversal/adjustment; never overwrite a settled payment silently.
- Inventory: movement ledger; resolve competing adjustments as separate movements with actor/reason.
- Menu/configuration: cloud-authoritative versioned configuration, with local cached version and an explicit offline change policy.
- Staff/device access: short-lived signed authorization grants with defined offline expiry and emergency access policy.

### Redis boundary

Redis is optional and non-authoritative. Use it for reconstructible cache, ephemeral realtime fan-out, rate limiting, and background job coordination if justified. Do not use Redis Pub/Sub as a durable outbox, do not store orders/payments/stock as the only copy in Redis, and do not use Redis replication as database synchronization.

## 7. Migration strategy — staged, not a one-shot rewrite

1. **Freeze and validate baseline.** Pin the Claude branch commit; run schema tests against a disposable PostgreSQL database; verify generated ERD/Data Dictionary and seed consistency.
2. **Introduce tenant/outlet roots.** Create tenants/outlets and deterministic bootstrap mapping for the current demo restaurant. Add tenant/outlet columns as nullable first.
3. **Backfill existing rows.** Assign every current row to the bootstrap tenant/outlet according to the scope table. Detect orphan rows and duplicate keys before adding constraints.
4. **Add scoped uniqueness and foreign keys.** Add composite unique keys/FKs and indexes; only then enforce NOT NULL on required scope columns.
5. **Move settings and authentication.** Migrate singleton settings to outlet settings; introduce identity subject/membership and replace PIN-only assumptions.
6. **Add inventory ledger.** Seed opening-balance movements from current_stock with a migration reference; make all future stock changes ledger-backed and reconcile balances.
7. **Add audit and payment lifecycle.** Backfill only what is supportable; do not fabricate historical provider states.
8. **Add outbox/inbox and local node/device registration.** Start with one outlet in a test environment; test disconnected operation, retry, duplicate delivery, replay, and recovery.
9. **Enable RLS as defense in depth.** Set transaction-local tenant context from authenticated server-side identity. Test connection-pool context reset and bypass privileges carefully; RLS is not a substitute for service authorization.
10. **Deploy with rollback.** Use expand/migrate/contract migrations, backups, restore rehearsal, schema-version compatibility, and a documented rollback plan.

Never apply this plan directly to a live database without a verified backup, migration rehearsal, and team approval.

## 8. Minimum acceptance tests

- Tenant A cannot read or mutate Tenant B data through any API, background job, export, or guessed UUID.
- Outlet A cannot access Outlet B operational records unless an explicitly authorized multi-outlet role permits it.
- Two outlets can both have table number "01" without collision.
- Two tenants can use the same discount code and staff display name without collision.
- A local order and its outbox event commit atomically.
- Re-delivering the same event_id does not duplicate orders, payments, or stock movements.
- Outbox retries survive local process restart and internet outage.
- A stale/invalid local node credential is rejected and can be revoked.
- QRIS/card timeout is shown as unknown/pending until provider reconciliation; it is not marked paid just because the order was saved locally.
- Stock movement and cached stock balance update atomically; negative stock/shortage policy is explicit.
- Refund/void/stock adjustment/role change is auditable.
- Outlet timezone correctly determines business-day settlement around midnight and daylight/timezone boundaries.
- Schema migration can be run on a copy of current seeded data and rolled back or forward-recovered as documented.

## 9. Decisions still required from product/team

1. Can a menu be shared across all outlets with per-outlet price/availability overrides?
2. Can staff belong to multiple tenants or outlets? Which roles are tenant-wide versus outlet-specific?
3. Should each outlet have one active local node with hot-standby support, or multiple nodes?
4. What is the permitted offline authorization duration, and how are revoked staff/devices handled while disconnected?
5. Which payment providers are in scope, and what are their idempotency/reconciliation contracts?
6. Is inventory tracked per outlet only, or also per storage location/warehouse with inter-location transfers?
7. What is the business-day cutoff and timezone policy for settlement?
8. Which configuration changes may be made locally while disconnected?

## 10. Files and ownership

- Claude's original `ERD.md`, `DATA_DICTIONARY.md`, `schema.sql`, and `seed.sql` remain the baseline and are not modified by this proposal.
- This document is a target design for team review.
- Once accepted, implement versioned migrations under `db/migrations/`, update schema generation tooling, and regenerate ERD/Data Dictionary from PostgreSQL rather than hand-editing generated artifacts.
- Keep implementation decisions aligned with the System Architecture ADR and the approved product behavior.

---
**Review status:** Proposed. Do not treat this document as an approved production schema or run it as SQL.
