# Gastro-Cashier — Database Design Comparison (Claude vs GPT)

- **Status:** Draft for team review; not an approved schema.
- **Purpose:** Compare the existing Claude PostgreSQL baseline with GPT's multi-tenant/hybrid target proposal before choosing an implementation direction.
- **Repository:** `beitro/Gastro-Cashier`
- **This document is an evaluation artifact only.** It does not modify either design, create SQL migrations, or authorize a production database change.

## 1. Executive summary

**The two designs are complementary, not direct substitutes.**

- **Claude** provides the more concrete POS relational baseline: 19 tables, 8 views, database functions/triggers, constraints, seed data, ERD, and a generated Data Dictionary. It models day-to-day restaurant operations in detail.
- **GPT** provides a target architecture for multi-tenant SaaS and Hybrid Local Network Mode: tenant/outlet boundaries, local nodes/devices, durable sync, inventory ledger, audit trail, and payment lifecycle. It is a proposal, not an executable schema or migration.
- **Recommended direction:** retain Claude's POS domain model as the starting point, then apply a reviewed subset of GPT's multi-tenant/hybrid extensions. Do not replace Claude's model wholesale and do not implement GPT's proposal as-is.

This recommendation is conditional on the product decisions in Section 10 and successful schema/migration tests. Neither branch is approved for production.

## 2. Exact comparison baseline

| Design | Branch | Pinned commit | Artifact | Nature |
|---|---|---|---|---|
| Claude | `feat/db-schema-erd` | `cced75cbdeb748d6697f46f9706120fc578a4c2e` | [ERD](https://github.com/beitro/Gastro-Cashier/blob/feat/db-schema-erd/ERD.md), [Data Dictionary](https://github.com/beitro/Gastro-Cashier/blob/feat/db-schema-erd/DATA_DICTIONARY.md), [schema.sql](https://github.com/beitro/Gastro-Cashier/blob/feat/db-schema-erd/schema.sql), [seed.sql](https://github.com/beitro/Gastro-Cashier/blob/feat/db-schema-erd/seed.sql) | Concrete PostgreSQL schema baseline |
| GPT | `feat/multitenant-hybrid-db-foundation` | `d496597283450fd0bc8f9d2191ab8188611951db` | [Multi-tenant & Hybrid DB Design](https://github.com/beitro/Gastro-Cashier/blob/feat/multitenant-hybrid-db-foundation/docs/database/MULTI_TENANT_HYBRID_DB_DESIGN.md) | Target design / implementation guidance; not executable SQL |

The comparison is based on these pinned artifacts. If either branch changes, rerun the review against the new commit rather than silently comparing moving branch heads.

## 3. Side-by-side evaluation

| Evaluation area | Claude baseline | GPT proposal | Assessment / direction |
|---|---|---|---|
| POS core entities | Detailed entities for tables, menu, modifiers, recipes, transactions, batches, items, payments, tickets, staff, waiters, stock, petty cash, settings, roles, units, discounts | Intentionally reuses the existing POS entities | **Keep Claude's domain model** as the starting point |
| Concrete SQL | Yes: PostgreSQL DDL, constraints, indexes, views, functions and trigger logic | No complete DDL or migration scripts | Claude is ahead in implementation detail |
| Data Dictionary / ERD | Generated Data Dictionary and ERD exist | Design document maps changes to existing entities | Keep Claude's generated artifacts as baseline; regenerate after approved migrations |
| Tenant isolation | No tenant/outlet ownership columns or scoped authorization model in current baseline | Defines tenant, outlet, memberships, local nodes/devices, scoped keys and composite-FK approach | GPT covers a critical SaaS gap; needs concrete schema and authorization tests |
| Outlet separation | Single restaurant settings row; table numbers and some identities globally unique | Outlet-scoped settings, tables, stock, transactions, staff access | Adopt outlet ownership and scoped uniqueness |
| Local Network Mode | No durable local/cloud synchronization model | Local PostgreSQL authority during outage; outbox/inbox/cursors/conflicts and sync worker | GPT is materially stronger for the stated hybrid requirement |
| Sync durability | No outbox/inbox or durable sync checkpoint model | Transactional Outbox, idempotent inbox, retry, acknowledgement and conflict quarantine | Adopt the pattern, but define event contracts, ordering and retention before implementation |
| Payments | Payment rows and payment-first/last concepts; arithmetic constraints and transaction link | Adds provider attempt lifecycle, references, idempotency and reconciliation | Keep Claude's payment domain; extend lifecycle. Gateway integration remains a separate team-owned task |
| Inventory | Current stock and recipes; deduction function; no immutable movement ledger | Append-only inventory movement ledger and atomic balance updates | Add ledger before relying on stock for multi-device/offline operations |
| Auditability | No dedicated audit log entity identified in baseline | Adds audit log with actor, resource, request/device context | Add audit events for sensitive operations |
| Security / identity | PIN hash is globally unique; Data Dictionary notes source UI used plaintext demo PINs and HMAC-SHA256 proposal | Advises against PIN as identity; recommends account identity, slow salted password hash, rate limits and scoped access | GPT's direction is safer; implement with a reviewed identity and offline authorization policy |
| Transaction integrity | Useful CHECK constraints, foreign keys, partial unique index for one active transaction per table, integrity views | Recommends tenant/outlet composite foreign keys and server-side price calculation | Combine database-level business integrity with scope-aware referential integrity |
| Historical snapshots | Item name/category/destination/price and modifier text are stored on transaction items | Explicitly recommends preserving snapshots | Preserve Claude's snapshot approach |
| Reporting / operational views | 8 views for table board, transaction summary, KDS, waiter pickup, daily settlement, stock status and integrity checks | Focuses on architecture and data lifecycle, not reporting view definitions | Retain and review Claude's views after adding tenant/outlet filters |
| Migration readiness | Existing SQL and seed are concrete, but SaaS/hybrid migration is not yet designed | Staged expand/backfill/constraints/ledger/sync migration plan | GPT gives a migration sequence, but team must turn it into versioned, tested migrations |
| Performance evidence | Indexes exist; no workload benchmark shown in the reviewed artifacts | Recommends indexes and scalable boundaries; no benchmark | **No winner can be declared on performance** without representative query plans/load tests |

## 4. What Claude does well

1. **Models the actual POS workflow.** Payment First/Last, transaction batches, item modifiers, KDS/print tickets, recipes, table status and petty cash are represented explicitly.
2. **Has an inspectable PostgreSQL artifact.** The team can review real column types, defaults, foreign keys, unique constraints and CHECK constraints rather than only conceptual boxes.
3. **Includes operational/reporting views.** The views provide useful projections for the current POS workflows and integrity checks.
4. **Documents source-code behavior that affects persistence.** The Data Dictionary calls out important demo assumptions and mismatches, such as client-side price submission, stock clamping, missing recipes and hard-coded cashier names.
5. **Preserves transaction history.** Item and modifier snapshots reduce the risk that later menu edits rewrite old orders.

### Claude baseline gaps relative to the SaaS + hybrid target

- No tenant/outlet ownership model; the schema is effectively single-restaurant.
- `restaurant_settings` uses a singleton constraint.
- `dining_tables.table_number`, waiter name, staff PIN hash and NFC UID use global uniqueness assumptions that need scope/policy review.
- No durable outbox/inbox/cursor/conflict model for disconnected local nodes.
- No append-only inventory movement ledger.
- No dedicated audit log.
- Payment table does not by itself model provider attempts, asynchronous confirmation, timeout/unknown status, reversal/refund or reconciliation.
- PIN/HMAC handling needs a security redesign; a PIN must not be treated as a globally unique identity.
- Some current-state columns (for example stock balance) need an agreed source-of-truth and reconciliation policy.

These are gaps against the intended SaaS/hybrid product, not proof that Claude's schema is poor for a single-outlet prototype.

## 5. What GPT does well

1. **Makes tenant and outlet ownership explicit.** It distinguishes the subscribing business, physical outlet, local server, device and staff access.
2. **Treats offline operation as a data consistency problem.** It proposes durable local writes and transactional outbox events, not browser cache or Redis Pub/Sub as the system of record.
3. **Adds operational traceability.** Inventory movements and audit logs address stock and sensitive-action history.
4. **Defines failure/retry behavior.** Idempotency, acknowledgement, retry, conflict quarantine and domain-specific conflict policies are included.
5. **Proposes staged migration.** It avoids a one-shot rewrite and calls for backfill, scoped constraints, rehearsals and rollback planning.

### GPT proposal gaps / items not yet proven

- It is a design document, not a complete SQL schema. Entity names and suggested columns still need detailed DDL, keys, indexes, constraints and migration scripts.
- Outbox/inbox event envelope, schema evolution, ordering guarantees, retention, replay, dead-letter operations and payload privacy need concrete contracts.
- Multi-node local topology, failover, node replacement and device credential rotation remain product/operations decisions.
- Offline authorization duration and behavior after staff/device revocation need a defined policy.
- Tenant/outlet composite foreign keys must be designed consistently across all child tables; adding scope columns alone is insufficient.
- Inventory movement semantics (unit conversion, transfer, waste, returns, negative-stock policy, costing) need domain validation.
- Payment lifecycle is guidance only; provider-specific states and reconciliation remain to be designed with the payment team.
- No migration has been run against Claude's seed data, and no performance benchmark or end-to-end sync test is supplied.

## 6. Important findings that must not be hidden by the comparison

These findings come from the Claude Data Dictionary / schema notes and GPT's design document. They should be treated as review items, not automatically fixed by choosing one proposal.

| Priority | Finding | Why it matters | Required decision / action |
|---|---|---|---|
| P0 | Tenant/outlet isolation is absent from the current baseline | SaaS tenants could otherwise share or access each other's records if application boundaries fail | Define tenant/outlet scope and test cross-tenant denial before SaaS rollout |
| P0 | Local/cloud sync design is absent from the current SQL baseline | Offline orders could be lost, duplicated or diverge when connectivity returns | Approve durable outbox/inbox and idempotent sync contracts |
| P1 | Payment record is not equivalent to provider confirmation | A locally stored QRIS/card payment must not be assumed paid | Model pending/succeeded/failed/unknown/reversed states; provider integration is owned by the team |
| P1 | Stock has no immutable movement history | Current balance alone cannot explain sales, adjustments, waste or reconciliation | Add ledger and define shortage/negative-stock policy |
| P1 | PIN identity/security assumptions are unsafe for production | Global PIN uniqueness and fast HMAC are not an adequate staff identity/authentication design | Define staff identity, password hashing, rate limits and offline access policy |
| P1 | Global uniqueness assumptions conflict with multi-outlet operation | Two outlets may legitimately use table "01" or the same display names | Replace with scope-aware uniqueness where business rules require it |
| P1 | Transaction history must remain immutable and scoped | Menu edits or cross-outlet references must not corrupt historical records | Preserve snapshots and enforce scoped foreign keys |
| P2 | No comparative performance evidence | Index choices cannot be validated by intuition alone | Benchmark representative cashier, KDS, settlement and sync workloads |
| P2 | Migration and recovery are unproven | A design may look correct but fail during real data migration or outage recovery | Rehearse on a copy of seeded/demo data and test restore/replay |

Payment-related items above are database lifecycle requirements only. This comparison does **not** authorize or implement payment gateway integration.

## 7. Recommended combined target

Use **Claude as the POS domain foundation** and **GPT as the SaaS/hybrid extension guide**, subject to team review.

### Keep from Claude

- Existing POS entity concepts and relationships.
- Transaction, batch, item, modifier and payment separation.
- Snapshot fields for historical orders.
- Database constraints and integrity checks, after scope review.
- KDS, waiter, settlement and table-board views, updated for tenant/outlet scope.
- Data Dictionary and ERD generation from the database schema.

### Adopt from GPT, after detailed design

- `tenants`, `outlets`, membership/access model.
- Local node and device registration.
- Outlet-specific settings and scope-aware uniqueness.
- Tenant/outlet composite keys and foreign keys.
- Durable local outbox, cloud inbox, sync cursors and conflict quarantine.
- Inventory movement ledger.
- Audit log.
- Payment attempt/reconciliation lifecycle fields or entity.
- Expand/backfill/validate/contract migration strategy and recovery tests.

### Do not adopt blindly

- Do not add `tenant_id` and `outlet_id` mechanically to every table; determine ownership/inheritance and enforce it with keys.
- Do not build all sync tables before event contracts and failure semantics are agreed.
- Do not use Redis as the durable sync queue or business database.
- Do not create a microservices split just because the system is SaaS.
- Do not treat this comparison as a final SQL schema or production migration.

## 8. Proposed review scorecard

Score each category from 1 (not addressed) to 5 (strongly addressed). Scores are a **qualitative review aid based on artifact completeness**, not a benchmark or objective quality rating.

| Category | Weight | Claude | GPT | Notes |
|---|---:|---:|---:|---|
| POS domain coverage | 20% | 5 | 3 | GPT intentionally reuses Claude's domain model |
| Relational implementation detail | 15% | 5 | 2 | GPT proposal has no full DDL |
| Multi-tenant isolation | 15% | 1 | 4 | GPT still needs concrete SQL and tests |
| Hybrid offline/sync | 20% | 1 | 4 | Must validate end-to-end delivery and recovery |
| Inventory/audit/payment lifecycle | 15% | 2 | 4 | GPT proposes extensions, not implemented schema |
| Migration/testing evidence | 10% | 2 | 2 | Neither artifact proves a successful migration rehearsal |
| Documentation clarity | 5% | 5 | 4 | Both are reviewable; different artifact types |

**Interpretation:** This scorecard does not mean “Claude wins” or “GPT wins.” It shows why the recommended path is a combined design. The score values should be adjusted by the team if they disagree with the evidence or product priorities.

## 9. Suggested team review sequence

1. Confirm product scope: multi-tenant SaaS, number of outlets per tenant, local server topology and offline duration.
2. Review Claude's 19-table SQL, ERD and Data Dictionary as the POS domain baseline.
3. Review each proposed GPT extension and mark it **Accept / Modify / Reject / Defer**.
4. Resolve scope questions before writing migrations: menu sharing, staff memberships, inventory locations, node failover, offline access and business-day timezone.
5. Produce a single approved logical ERD and data dictionary.
6. Write versioned SQL migrations on a dedicated implementation branch.
7. Test migration/backfill on a disposable PostgreSQL database loaded with Claude's seed data.
8. Run tenant isolation, offline sync, duplicate delivery, restart/recovery, inventory ledger and payment-state tests.
9. Only after team approval, plan implementation and release. Do not merge or deploy from this comparison document.

## 10. Decisions the team must answer

| # | Question | Why it blocks final schema |
|---:|---|---|
| 1 | Can one tenant own multiple outlets? | Determines ownership keys and access model |
| 2 | Is menu/pricing shared tenant-wide, or can each outlet override price/availability? | Determines menu ownership and outlet override tables |
| 3 | Can one staff member access multiple outlets? Can they work for multiple tenants? | Determines identity and membership relations |
| 4 | Is there exactly one local server per outlet, or is hot standby/multiple local nodes required? | Determines node registration, leases and sync ownership |
| 5 | How long may a cashier authenticate/work offline after access is revoked in cloud? | Determines signed local grants and revocation policy |
| 6 | Is inventory tracked only per outlet, or per storage location/warehouse? | Determines stock ledger scope and transfer model |
| 7 | What is the policy for selling when stock is insufficient? | Determines reservation/deduction and negative-stock rules |
| 8 | Which payment providers and states will the integration team support? | Determines payment attempt/reconciliation contract; integration itself remains team-owned |
| 9 | What defines the business day and settlement cutoff per outlet? | Determines reporting boundaries and timezone rules |
| 10 | Which configuration changes are allowed locally while internet is down? | Determines source-of-truth and conflict policy |

## 11. Review checklist

- [ ] Team agrees Claude's POS domain entities are the baseline.
- [ ] Tenant/outlet ownership and authorization boundaries are approved.
- [ ] Scope-aware unique constraints and composite foreign keys are reviewed.
- [ ] Local node/device identity and offline authorization policy are approved.
- [ ] Outbox/inbox event contract, idempotency and retry/recovery rules are approved.
- [ ] Inventory ledger semantics and shortage policy are approved.
- [ ] Payment lifecycle/reconciliation requirements are agreed with the integration team.
- [ ] Audit events and retention requirements are approved.
- [ ] Migration/backfill/rollback plan is reviewed.
- [ ] SQL, seed, ERD and Data Dictionary tests pass in a disposable environment.
- [ ] Representative query plans and performance tests are reviewed.

## 12. Source artifacts

- Claude ERD: https://github.com/beitro/Gastro-Cashier/blob/feat/db-schema-erd/ERD.md
- Claude Data Dictionary: https://github.com/beitro/Gastro-Cashier/blob/feat/db-schema-erd/DATA_DICTIONARY.md
- Claude PostgreSQL schema: https://github.com/beitro/Gastro-Cashier/blob/feat/db-schema-erd/schema.sql
- Claude seed data: https://github.com/beitro/Gastro-Cashier/blob/feat/db-schema-erd/seed.sql
- GPT multi-tenant/hybrid design: https://github.com/beitro/Gastro-Cashier/blob/feat/multitenant-hybrid-db-foundation/docs/database/MULTI_TENANT_HYBRID_DB_DESIGN.md

---
**Final status:** Draft comparison for discussion. No schema has been selected, no SQL has been generated, no migration has been applied, and neither Claude nor GPT's source artifact has been modified.
