# Gastro-Cashier stabilization plan

Audit snapshot: 2026-11-10  
Repository: `beitro/Gastro-Cashier`  
Default branch: `main`

## Goal

Stabilize the repository and establish one verifiable release path before adding new POS features or deploying database migrations.

## Current repository findings

- The default branch is `main`.
- The backend/API and Neon migration work is currently concentrated on `feat/postgres-consolidated`; it is not yet the default branch.
- PR #7 is an open, large integration PR (36 changed files at the time of this audit) and was reported as not mergeable. Do not merge it as a single unreviewed release step.
- Follow-up work represented by PRs #10–#16 has been incorporated into the consolidated feature branch, not necessarily into `main`.
- The production Neon deployment workflow and runtime-role provisioning scripts exist on the consolidated feature branch but are absent from `main`.
- The deployment workflow applies migrations 002, 003, and 004, then provisions the runtime role and signed RLS key. It does not apply `005_emergency_staff_readonly.sql`.
- The runtime-role provisioning script grants column-limited INSERT privileges for staff and membership creation. Migration 005 revokes those staff/membership mutation privileges while preserving the read projection used by the staff directory endpoint. The deployment workflow must apply migration 005 after provisioning the runtime role and before the final runtime verification.
- The POS frontend on the consolidated branch still has significant localStorage-backed state. It must not be described as fully database-backed or production-ready multi-device POS.
- The payment API currently treats non-cash methods as received for the full invoice amount without provider confirmation. Real gateway settlement must remain disabled until provider verification is implemented.
- The order API currently creates order batches and items but does not atomically decrement menu stock. Inventory enforcement and manager-authorized cancellation/restock need a dedicated transactional design.

## Neon reconciliation finding

Read-only inspection of the connected Neon organization found two projects:
- `billowing-pond-35727408`, which contains branches named `production`, `gastro-test-seed`, and a backup branch.
- `damp-wildflower-74102629`, a separate project named Gastro-cashier.

Read-only checks of the three inspected branches returned zero application relations in schema `public`. This conflicts with repository notes that describe an existing seeded development schema. The intended project, branch, and database identity must be reconciled with the owner before any migration or write.

## Release work order

1. **Repository and database reconciliation**
   - Re-check current default branch and PR heads.
   - Identify the canonical Neon project, branch, and database.
   - Compare expected baseline objects and migration history against the actual target.
   - Keep all Neon inspection read-only until the target is explicitly confirmed.

2. **Migration and runtime privilege hardening**
   - Add migration 005 to the gated deployment workflow after runtime-role provisioning.
   - Verify effective table and column privileges for `gastro_runtime`.
   - Add a test that staff-directory reads still work and staff/membership mutations fail.
   - Do not run the production workflow as part of this code change.

3. **Backend transaction correctness**
   - Enforce stock atomically within the order transaction.
   - Define manager-authorized cancellation and restock semantics.
   - Verify multi-order-per-table behavior and concurrency under competing requests.
   - Add idempotency and race-condition tests.

4. **Settlement correctness**
   - Separate cash/manual recording from provider-confirmed gateway payments.
   - Never mark QRIS/card/transfer as provider-paid without a verified provider result.
   - Preserve an auditable payment state and settlement history.

5. **Frontend/API integration**
   - Move operational POS state from localStorage to the API in controlled slices.
   - Verify POS, KDS, waiter, cashier, and admin views against persisted state.
   - Address token storage and session lifecycle before public production use.

6. **Release validation**
   - Run lint, build, unit/integration/API tests on the exact proposed commit.
   - Verify backup/restore and RLS isolation.
   - Deploy to a confirmed staging target before any production release.

## Guardrails

- No production migration, data mutation, credential rotation, or deployment without separate explicit authorization.
- No merge of PR #7 until its complete diff, dependencies, migrations, conflicts, and exact-head CI are reviewed.
- Prefer small, single-purpose PRs with reproducible validation.
- Treat branch names and database names as identifiers to verify, not proof that a target is safe.
