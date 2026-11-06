# ADR-001: Hybrid SaaS Architecture for Gastro-Cashier

- **Status:** Proposed — pending engineering-team review
- **Date:** 2026-11-06
- **Decision owners:** Product/engineering team
- **Scope:** Target architecture for a multi-tenant restaurant POS with local-network operation during internet outages

## Context

Gastro-Cashier is intended to operate as a multi-tenant SaaS product with a hybrid deployment model. A restaurant must be able to continue core POS and kitchen-display workflows when its internet connection is unavailable. The selected offline direction is **Option C — Local Network Mode**: devices at an outlet communicate with a local server over the restaurant LAN.

The repository has an existing React/Vite/TypeScript frontend. The initial source review also found Firebase Authentication integration and Google Sheets export/integration code. The `express` package is listed as a dependency, but an active Express server was not confirmed in the files reviewed. No Redis or PostgreSQL implementation was identified in that initial, limited review. These are observations about the files inspected, not a claim that the entire repository has been exhaustively audited.

## Decision

Adopt a **modular monolith as the initial backend architecture**, with a local runtime at each outlet and a cloud SaaS control plane. Keep service boundaries modular in code; do not introduce microservices until operational needs justify them.

### Logical topology

```text
                    CLOUD / SAAS
        +--------------------------------------+
        | Tenant & outlet management           |
        | Subscription / licensing             |
        | Central API and authentication       |
        | Reporting / consolidated analytics  |
        | PostgreSQL (cloud)                   |
        | Redis (cloud cache / jobs / pub-sub) |
        +-------------------^------------------+
                            |
                     HTTPS sync API
                 Outbox / Sync Worker
                            |
                 Internet (may be down)
                            |
                    RESTAURANT OUTLET
        +--------------------------------------+
        | Local API / business modules         |
        | Local PostgreSQL                     |
        | Outbox + Sync Worker                 |
        | Optional local Redis                 |
        +-------------------^------------------+
                            |
                       Restaurant LAN
                 +----------+----------+
                 |          |          |
              Cashier      KDS      Manager
        ```

### Local outlet runtime

- Run the authoritative POS business operations for that outlet on a local server reachable over the LAN.
- Use local PostgreSQL as the durable source of truth for outlet transactions, order state, kitchen state, and local operational records.
- Cashier and KDS clients must use the local API while operating on the outlet network; core workflows must not depend on a live cloud round trip.
- Local Redis is optional and should only be introduced where measured needs justify it (for example, ephemeral cache, short-lived coordination, or realtime fan-out). It is not a prerequisite for local transactions.
- Define local backup, restore, health monitoring, device discovery/addressing, and server replacement procedures before production rollout.

### Cloud SaaS runtime

- Provide tenant/outlet lifecycle, subscription and licensing, central identity integration, cross-outlet reporting, product configuration distribution, and remote administration.
- Use cloud PostgreSQL for durable SaaS records and synchronized business data.
- Use cloud Redis for cache, background-job coordination, rate limiting, and ephemeral realtime fan-out where appropriate.
- Keep cloud-only features from blocking local order taking and kitchen execution during an internet outage.

## Data synchronization

Use a **Transactional Outbox + Sync Worker** pattern:

1. A local business transaction and its outbox event are committed atomically in the same local PostgreSQL transaction.
2. A local sync worker sends pending events to an authenticated cloud sync API when connectivity is available.
3. The cloud API validates tenant/outlet identity, event schema and authorization, then processes each event idempotently.
4. The cloud acknowledges accepted events; the local worker records the acknowledgement and retries transient failures with backoff.
5. Conflicts and permanent validation failures are quarantined for inspection and explicit resolution; do not silently overwrite newer business data.

Requirements:

- Every event needs a stable event ID, tenant ID, outlet ID, aggregate/entity ID, event type, schema version, occurred-at timestamp, and correlation/idempotency key.
- The server must derive tenant and outlet authorization from authenticated credentials and server-side membership, not trust tenant identifiers supplied by a client.
- Define ordering guarantees per aggregate (for example, per order) rather than assuming global ordering.
- Define retention, replay, dead-letter handling, schema evolution, and observability for the outbox.
- Do not use Redis Pub/Sub as durable transaction/event storage, and do not treat Redis replication as the local-to-cloud transaction synchronization mechanism.

## Redis responsibilities and boundaries

Redis may be used for:

- Short-lived cache of data that can be reconstructed from PostgreSQL.
- Background job queues and worker coordination (for example, BullMQ if Node.js is selected).
- Ephemeral WebSocket/SSE fan-out across multiple backend processes.
- Rate limiting, short-lived locks, and session storage where the failure semantics are explicitly designed.

Redis must not be the system of record for orders, payments, inventory movements, or synchronization history. Durable business state belongs in PostgreSQL. Queue consumers must be idempotent because jobs can be retried or delivered more than once.

Start with a single appropriately monitored Redis deployment per environment if Redis is needed. Do not begin with Redis Cluster or Kubernetes without measured scale and operational justification.

## Backend and API structure

- Preserve and audit the current repository before choosing a framework. The presence of an `express` dependency alone does not prove an Express backend is active.
- Prefer a modular monolith with explicit modules such as Identity & Access, Tenant/Outlet, Catalog, Orders, Payments, Kitchen, Inventory, Reporting, and Synchronization.
- Keep API contracts versioned and documented. Validate inputs at the boundary and enforce authorization in backend services.
- Use an API abstraction so cashier/KDS clients can target the local outlet API while administrative SaaS clients use cloud APIs.
- Avoid a premature rewrite. Confirm the existing frontend integration and backend state before selecting or replacing frameworks.

## Multi-tenant security

- Every cloud business record must be scoped to a tenant and, where applicable, an outlet.
- Enforce tenant/outlet authorization on the server for every read and write. Never rely on a frontend-provided `tenant_id` as proof of access.
- Consider PostgreSQL Row-Level Security as defense in depth, in addition to application authorization.
- Use TLS for cloud traffic and authenticated, encrypted communication for local administration and device-to-server traffic where feasible.
- Store secrets outside source control; rotate credentials and use least-privilege service identities.
- Audit sensitive actions (user/role changes, refunds, voids, price overrides, cash adjustments, exports, and sync conflict resolution).
- Design local access controls for internet outages, including credential/session expiry behavior and emergency administrator access.

## Payment and outage semantics

- A locally saved order is not proof that an external payment provider has successfully captured or settled a payment.
- Cash payments can be recorded locally under a defined offline policy.
- QRIS, card, and other online-provider payments require provider-specific connectivity and confirmation handling. Show pending/unknown states accurately and reconcile them after connectivity returns.
- Define idempotency and reconciliation procedures for payment requests to prevent duplicate charges.

## Deployment and operations

- Package the outlet runtime for repeatable installation and upgrades; support health checks, structured logs, metrics, backup/restore, and rollback.
- Use controlled, staged releases for local servers because an outlet may be temporarily disconnected from the cloud.
- Cloud deployment should include automated migrations, backups, secrets management, monitoring, alerting, and disaster-recovery procedures.
- Keep local and cloud schema compatibility explicit during rolling upgrades; synchronization must tolerate supported version skew.
- Begin with simple deployment primitives. Add orchestration only when scale and operations warrant it.

## Consequences

**Benefits**
- Core cashier and kitchen workflows can continue over the LAN during an internet outage.
- PostgreSQL provides durable transaction storage locally and centrally.
- A modular monolith reduces early deployment and debugging complexity while preserving clear domain boundaries.
- Outbox-based synchronization supports retries and auditability without making Redis a transaction database.

**Costs and risks**
- Each outlet introduces local-server installation, monitoring, backup, upgrade, and physical security responsibilities.
- Synchronization needs careful idempotency, ordering, conflict, schema-version, and recovery design.
- Local identity and payment behavior during prolonged outages require explicit product and security policies.
- Reporting data may be delayed until synchronization resumes.

## Open questions for team review

1. What are the exact entities, ownership boundaries, and transaction invariants from the ERD/data dictionary?
2. Which existing backend code, if any, is active beyond the frontend and integrations inspected so far?
3. Will Firebase Authentication remain the identity provider, and how will local authentication/authorization work during internet outages?
4. Which payment providers and payment methods must support offline or deferred confirmation?
5. What are the target outlet device count, transaction volume, retention period, and recovery objectives (RPO/RTO)?
6. What is the chosen local-server hardware/OS and supported installation/update mechanism?
7. Which data is mastered locally versus in the cloud, and what is the conflict-resolution policy for each aggregate?
8. What is the exact tenant/outlet model and isolation strategy after the ERD review?

## Review checklist

- [ ] Compare this topology with Claude's ERD and data dictionary.
- [ ] Confirm current backend/runtime by inspecting the complete repository and deployment configuration.
- [ ] Define local authentication, authorization, and credential lifecycle.
- [ ] Define sync event envelope, idempotency, ordering, retries, replay, and conflict handling.
- [ ] Define payment outage states and reconciliation.
- [ ] Validate backup/restore, upgrade, rollback, and disaster-recovery procedures.
- [ ] Review threat model and tenant-isolation tests.
- [ ] Obtain engineering-team approval before treating this proposal as an implementation baseline.

---
This ADR is a proposal for review, not an approved implementation specification. Detailed schemas, endpoint contracts, Redis sizing, and deployment choices remain subject to repository audit, ERD/data-dictionary alignment, load testing, and team approval.
