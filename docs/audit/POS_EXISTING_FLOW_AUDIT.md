# POS Existing Flow Audit — Gastro-Cashier

**Status:** Draft — static repository review only  
**Base reviewed:** `main` (default branch)  
**Audit branch:** `audit/pos-existing-flow-review`  
**Scope:** Existing POS implementation, with emphasis on order lifecycle, payment, inventory, KDS, authentication/roles, persistence, and integrations.  
**Important:** No source code was modified in this audit. No automated tests or build were executed in this review. Findings below are based on source inspection and should be reproduced by the team before implementation.

## 1. Executive summary

The repository currently implements a substantial **single-browser POS prototype**: table/floor management, order batches, modifiers, Payment First/Payment Last, KDS, waiter handoff, inventory recipes, finance views, staff roles, printing, and Google Sheets export.

The main architectural limitation is that the application state and business rules live in the React client and browser `localStorage`. This is workable for a demo or a single-device prototype, but it is not a safe transactional foundation for multiple cashier/KDS devices, concurrent users, or the planned Local Network Mode / multi-tenant SaaS.

**Recommendation:** Do not start by rewriting the UI or introducing Redis. First harden the core POS lifecycle and introduce a trusted persistence/service boundary. Keep the current React UI as the interface while business operations move behind an authoritative backend/local POS service.

## 2. Findings by priority

### P0 — Payment method can be marked settled without provider/bank confirmation

**Evidence**
- `src/components/PaymentModal.tsx`: QRIS view creates an image through `api.qrserver.com` with a text payload containing transaction ID and amount. It is not an acquirer-issued/dynamic QRIS payment payload.
- The card view asks the cashier to choose a bank/EDC label; no EDC integration or approval response is consumed by the application.
- `handleProcessPayment` calls `onCompleteSettlement` for any non-cash method because `isCashSufficient` is true whenever the method is not cash.
- `src/components/OrderModal.tsx` has the same broad behavior in Payment First: QRIS/card selection can proceed to confirmation without a payment-provider result.

**Risk**
The application can record a QRIS/card transaction as paid even though no payment has been verified. This creates revenue, reconciliation, and fraud risk.

**Recommended correction**
Represent payment as an explicit lifecycle: `initiated -> pending -> succeeded | failed | expired | reversed`. Only mark the order settled after a trusted provider callback or an authorized, auditable manual EDC approval action. Clearly label the current QR image as demo-only until real QRIS integration exists.

### P0 — Staff authentication and authorization are client-side demo controls

**Evidence**
- `src/utils/authRoles.ts` contains default staff PINs (`9999`, `1234`, `5678`) and predictable NFC UIDs in source.
- `authenticateByPin` and `authenticateByNfc` compare plaintext values in the client.
- `src/App.tsx` restores `currentStaff` from `localStorage` and defaults to `DEFAULT_STAFF_ACCOUNTS[1]` when no saved value exists.
- Role permissions are client-side UI logic; no server-side authorization boundary is present in the reviewed implementation.

**Risk**
Anyone with browser/devtools access can inspect demo credentials or alter local state/role data. This is not production authentication.

**Recommended correction**
Remove production credentials from the client bundle. Authenticate against a trusted backend/local server, store only a revocable session credential, and enforce permissions on every server-side operation. Treat NFC UID as an identifier, not a secret.

### P1 — Browser localStorage is the only reviewed operational persistence layer

**Evidence**
- `src/App.tsx` persists tables, active/settled transactions, print tickets, stock, payment mode, staff, and petty cash in separate `localStorage` keys.
- Reads use unvalidated `JSON.parse`; write/read errors are swallowed by empty `catch {}` blocks.
- `confirmResetData` calls `localStorage.clear()`, which clears every origin key, not only Gastro-Cashier keys.
- No authoritative database/service API was found in the reviewed `src` tree.

**Risk**
Data is device/browser-bound, can be edited or lost, is not shared between cashier and KDS devices, and has no transaction/locking guarantee. Partial writes can leave inconsistent records.

**Recommended correction**
Move authoritative order, payment, stock, and staff state to a local server/database. Keep browser storage for non-critical UI preferences or a deliberately designed cache. Replace broad `localStorage.clear()` with deletion of application-owned keys only.

### P1 — Inventory is deducted at order submission and cannot be safely reversed

**Evidence**
- `handleSubmitOrder` deducts recipe materials as soon as Payment Last orders are submitted to kitchen/bar.
- Payment First deducts the new items at payment submission.
- `deductRecipeMaterials` clamps stock to zero with `Math.max(0, ...)`; it does not reject insufficient stock or preserve a negative/shortage balance.
- The reviewed types and handlers do not show a durable stock movement ledger or a compensating reversal flow for void/cancel/refund.

**Risk**
An order later cancelled or voided can leave stock understated. If usage exceeds available stock, clamping to zero hides the amount of the shortage. Repeated actions/retries also have no durable idempotency guard.

**Recommended correction**
Introduce append-only inventory movements (sale consumption, restock, waste, adjustment, reversal) with references to order/item and idempotency keys. Define the exact consumption point with restaurant operations; support compensating movements for void/refund. Alert or block on insufficient stock according to an explicit policy.

### P1 — Finance profit figures are estimates, not accounting-grade actuals

**Evidence**
- `calculateFinanceMetrics` estimates HPP as 36% of subtotal and gross profit as 64% of subtotal minus discounts.
- The function does not calculate COGS from actual recipe consumption or stock movement valuation.
- Petty cash is subtracted from this estimated gross profit to produce net operating profit.

**Risk**
Dashboard profit can materially differ from actual margin, inventory valuation, and operating profit. It may be mistaken for an accounting report.

**Recommended correction**
Label these values as estimates or replace them with cost-of-goods calculations based on recipe versions and stock movement valuation. Separate operational cash movement from accrual/accounting metrics.

### P1 — Order state is duplicated across transaction, batch, ticket, and table objects

**Evidence**
- `Transaction` stores both `batches[].items` and `allCurrentItems`.
- `App.tsx` separately stores tables, active transactions, settled transactions, and print tickets.
- Some handlers update both `allCurrentItems` and batch copies; other handlers update only one representation (for example waiter served-state handlers update `allCurrentItems`, while ticket state is updated separately).

**Risk**
The same item can have conflicting status depending on which representation a screen reads. This becomes more fragile with concurrent devices and sync.

**Recommended correction**
Define one canonical item/order state model. Treat print tickets as immutable generated snapshots/events, not another mutable copy of current order state. Add invariants and tests for batch/item consistency.

### P2 — POS flow and calculation test coverage is narrow

**Evidence**
- Tests exist for calculation helpers, KDS handoff helpers, role helpers, and Google Sheets row construction.
- `package.json` defines `build` and `lint`, but no `test` script is present.
- The reviewed test files do not exercise full React/App workflows such as Payment First with an existing unpaid bill, duplicate settlement, table closure, failed export, or cancellation/refund.

**Risk**
Business-critical regressions can pass unnoticed even when helper-level tests pass.

**Recommended correction**
Add a repeatable test command and integration tests for complete POS scenarios. Prioritize payment lifecycle, order batching, inventory reversal, table occupancy, and KDS/waiter transitions.

### P2 — Google Sheets create flow does not validate all write responses

**Evidence**
- In `createRestoSpreadsheet`, the initial spreadsheet creation response is checked.
- The subsequent sales and inventory `fetch` calls are awaited but their HTTP responses are not checked.
- The existing-spreadsheet export functions do check their response status.

**Risk**
The UI can report a successful spreadsheet creation even when one or both data population requests failed.

**Recommended correction**
Check both response statuses, return partial failure details, and avoid presenting the export as complete unless both writes succeed. Consider retrying safely and recording export attempts.

### P2 — Demo data and demo defaults are embedded in the operational startup path

**Evidence**
- `src/App.tsx` seeds occupied tables and active sample transactions.
- `src/data/initialData.ts` includes sample menu, stock, and floor data.
- A new session without saved state defaults to the demo cashier account.

**Risk**
Demo records and credentials can be mistaken for live business data if the prototype is deployed without a production initialization boundary.

**Recommended correction**
Separate demo fixtures from production startup. Require an explicit first-run setup/tenant bootstrap and never silently create an authenticated production staff session.

## 3. Existing capabilities worth preserving

- Separate Payment First and Payment Last flows.
- Order batches for additional orders on an occupied table.
- Item-level modifiers and notes.
- Separate kitchen/bar destinations.
- KDS cooking state and waiter handoff concepts.
- Recipe-based material consumption.
- Separate payment/receipt and station-ticket rendering.
- Existing helper tests for totals, discounts, stock deduction, and KDS handoff.

These are useful product behaviors; the recommended work is to harden the state and payment semantics rather than discard the current user experience.

## 4. Suggested remediation sequence

1. **Payment integrity:** mark QRIS/card demo flows as non-production; add a verified payment state and prevent unverified non-cash settlement.
2. **Order lifecycle invariants:** define canonical order/item state and test Payment First/Payment Last, add-order, settlement, and table release.
3. **Inventory integrity:** movement ledger, shortage policy, idempotency, and reversal/void/refund.
4. **Authentication boundary:** remove client-side demo credentials from production paths; enforce role checks in a trusted service.
5. **Persistence boundary:** introduce a local POS API/database service before multi-device or offline-network work.
6. **Reporting and exports:** distinguish estimated finance figures from actuals and make export completion reliable.

## 5. Proposed first implementation task

**Task:** POS Payment Integrity — Phase 1 (safe demo behavior and payment lifecycle guard).

Acceptance criteria:
- QRIS demo QR is not represented as a real QRIS payment.
- Card/EDC cannot be marked paid solely by selecting a bank.
- Non-cash settlement requires an explicit verified/authorized outcome.
- Payment First and Payment Last use the same payment-state rules.
- Existing cash checkout behavior remains covered by tests.
- No schema/backend assumption is silently introduced in this phase.

This first task should be implemented in a separate feature branch after the team reviews this audit and confirms the desired interim behavior for demo QRIS and manual EDC confirmation.

## 6. Review questions for the team

1. Is the current QRIS screen strictly a clickable/demo prototype, or is any outlet using it for real payments?
2. For card/EDC, should the first production release use manual supervisor-confirmed approval, or is an EDC/provider integration planned?
3. At what exact event should recipe stock be consumed: order sent to kitchen, item prepared, or payment settled?
4. Should cancelling an item after it has entered KDS require a manager approval and a stock reversal reason?
5. Which finance metrics are intended as estimates versus official operational/accounting figures?

---
**Audit limitation:** This is a source-level review of the current `main` tree. Runtime behavior, device/browser behavior, deployment configuration, and unreviewed code paths still require validation.