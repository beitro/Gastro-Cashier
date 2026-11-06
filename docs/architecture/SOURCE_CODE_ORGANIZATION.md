# Source Code Organization Guide — Gastro-Cashier

**Status:** Proposed / audit baseline  
**Branch:** `refactor/pos-code-organization`  
**Base:** `main`  
**Scope:** Documentation and source ownership map only. No runtime code changes in this commit.

## 1. Goal

Make the existing codebase easier for the product and engineering team to navigate, review, test, and extend. This guide describes the current code ownership and the proposed target boundaries. It does not authorize a large-scale rewrite or a change in POS behavior.

## 2. Current repository shape

```text
src/
├── App.tsx                    # Application shell + POS state orchestration
├── main.tsx                   # React/Vite entry point
├── index.css                  # Global styles and design tokens/utilities
├── components/                # Current UI components (many contain business flow)
├── data/                      # Demo/seed data
├── services/                  # External service integrations
├── types/                     # Shared domain types
└── utils/                     # Business rules, helpers, demo auth, sound, wireframe
```

Current high-complexity files observed:
- `App.tsx`: ~1,493 lines; app state, persistence, POS event handlers, and screen composition.
- `OrderModal.tsx`: ~1,246 lines; order composition and Payment First/Last UI flow.
- `figmaWireframe.ts`: ~842 lines; SVG wireframe generation.
- `GoogleSheetsModal.tsx`: ~588 lines; export UI.
- `FinanceView.tsx`: ~557 lines; finance UI and reporting presentation.
- `KDSModal.tsx`: ~528 lines; kitchen display and cooking actions.

File size is a signal for review, not proof that a file is defective. Refactoring should follow responsibility and dependency boundaries.

## 3. Current module ownership map

| Current file | Current responsibility | Proposed logical module |
|---|---|---|
| `App.tsx` | Root composition, app-wide state, local persistence, POS workflows | `app` + application use cases |
| `components/FloorPlanGrid.tsx` | Table/floor visualization and table actions | `pos/floor` |
| `components/OrderModal.tsx` | Menu selection, modifiers, notes, batches, order submission, payment-first UI | `pos/orders` + `payment` UI |
| `components/PaymentModal.tsx` | Settlement UI and payment method selection | `payment` |
| `components/KDSModal.tsx` | Kitchen/bar queue and cooking status | `kitchen/kds` |
| `components/WaiterCheckerModal.tsx` | Ready-item pickup and served status | `kitchen/waiter` |
| `components/InventoryModal.tsx` | Raw material stock UI/restock | `inventory` |
| `components/FinanceView.tsx` | Finance and petty-cash UI | `finance` |
| `components/OwnerDashboardView.tsx` | Owner dashboard | `reports/owner` |
| `components/SalesSummaryModal.tsx` | Sales summary UI | `reports/sales` |
| `components/PrinterModal.tsx` | Print dialog and ticket selection | `printing` |
| `components/ThermalReceipt.tsx` | Receipt/ticket rendering | `printing` |
| `components/LoginModal.tsx` | Staff login UI | `staff/auth` |
| `components/Navbar.tsx` | Navigation and current staff controls | `app/navigation` |
| `components/GoogleSheetsModal.tsx` | Google Sheets export UI | `integrations/google-sheets` |
| `data/initialData.ts` | Demo menu, tables, raw materials | `shared/demo-data` |
| `services/firebaseAuth.ts` | Firebase authentication adapter | `integrations/firebase` |
| `services/googleSheets.ts` | Spreadsheet API/export adapter | `integrations/google-sheets` |
| `types/pos.ts` | Shared POS domain types | `shared/domain` |
| `utils/posCalculations.ts` | Totals, discounts, ticket generation, stock and KDS rules | Split by domain: `pos`, `inventory`, `kitchen`, `printing` |
| `utils/authRoles.ts` | Demo staff credentials, auth helpers, role permissions, finance metrics | Split into `staff/auth`, `staff/permissions`, `finance/metrics` |
| `utils/soundEffects.ts` | UI sound effects | `shared/ui` |
| `utils/figmaWireframe.ts` | Figma wireframe SVG generation/download | `tools/figma-wireframe` |

## 4. Proposed target structure

This is a target direction, not a one-commit folder migration. Existing file names and import paths should remain stable until a migration step is ready and tested.

```text
src/
├── app/
│   ├── App.tsx
│   ├── providers/
│   └── navigation/
├── modules/
│   ├── pos/
│   │   ├── floor/
│   │   ├── orders/
│   │   └── transactions/
│   ├── payment/
│   ├── kitchen/
│   │   ├── kds/
│   │   └── waiter/
│   ├── inventory/
│   ├── finance/
│   ├── reports/
│   ├── staff/
│   │   ├── auth/
│   │   └── permissions/
│   ├── printing/
│   └── integrations/
│       ├── firebase/
│       └── google-sheets/
├── shared/
│   ├── domain/
│   ├── ui/
│   ├── utils/
│   └── demo-data/
├── tools/
│   └── figma-wireframe/
├── main.tsx
└── index.css
```

### Module boundary rules

1. **UI components render and collect intent.** They should not independently become the source of truth for transaction state.
2. **Domain functions own business rules.** Totals, discounts, order state transitions, stock movements, KDS transitions, and receipt ticket construction should be pure/testable where practical.
3. **Application/use-case functions coordinate workflows.** Examples: submit order, settle transaction, hand off ready items, restock material.
4. **Services/adapters handle external I/O.** Firebase, Google Sheets, future POS API, printer bridge, and payment provider integrations belong behind explicit interfaces.
5. **Types follow domain ownership.** Avoid a giant shared type file over time; move types only when consumers and boundaries are understood.
6. **Demo data is not production configuration.** Fixtures and demo credentials must be clearly marked and separated from production initialization.
7. **No circular dependencies.** Shared modules must not import from feature modules; features may depend on shared domain/UI primitives.
8. **No direct component-to-component state mutation.** Parent/use-case owns state transitions and passes callbacks or typed commands.

## 5. Comment and documentation standard

Comments should help the next developer understand **why a decision exists, what business rule is being protected, and what side effects occur**.

### Required comments
- Module/file header: responsibility and what is deliberately outside its scope.
- Complex business rules: calculation assumptions, ordering constraints, edge cases, and legal/operational caveats.
- State transitions: allowed previous/next states and side effects.
- External integrations: trust boundary, failure modes, retries, and whether operation is demo-only.
- Non-obvious workarounds: why needed and when safe to remove.

### Avoid
- Comments that repeat the code line-by-line.
- Stale comments that contradict behavior.
- Broad generic headers with no useful module ownership.
- Commenting every JSX element or every simple variable.
- Claiming security, payment verification, persistence, or offline guarantees that code does not actually provide.

### Suggested TypeScript documentation style

```ts
/**
 * Calculates the customer-facing settlement amount.
 *
 * Business rule:
 * - Applies item subtotal, configured discount, service charge, and PB1.
 * - This helper is a client-side demo calculation; production settlement
 *   must be recalculated by the trusted POS service.
 *
 * @param items Items included in this settlement.
 * @param discountAmount Discount amount already authorized by the caller.
 * @returns A breakdown used by the payment and receipt views.
 */
export function calculateSettlement(/* typed parameters */) {
  // Keep this helper pure so the calculation can be tested independently.
}
```

## 6. Refactoring sequence

### Phase 0 — Baseline and map (this commit)
- Record current source ownership and dependency map.
- Establish comment conventions and module boundaries.
- Keep runtime code unchanged.

### Phase 1 — Low-risk documentation and naming
- Add concise file/module headers to existing source files.
- Clarify exported functions with business rules and side effects.
- Rename ambiguous local variables only where safe.
- Do not change behavior or public props.

### Phase 2 — Extract pure business logic
- Split `posCalculations.ts` into focused POS, inventory, kitchen, and printing rule modules.
- Split `authRoles.ts` into staff auth, permission policy, and finance metrics.
- Preserve compatibility exports temporarily if imports are widespread.
- Add/retain unit tests before removing old exports.

### Phase 3 — Decompose application orchestration
- Reduce `App.tsx` by extracting storage adapter, state initialization, and application use cases.
- Keep React components focused on rendering and user input.
- Preserve the current UI and event semantics.

### Phase 4 — Decompose large feature components
- Start with `OrderModal.tsx`, then KDS, Finance, and Google Sheets UI.
- Extract sections into smaller components/hooks only when they have clear responsibilities.
- Keep props typed and avoid creating abstractions used only once without a clear benefit.

### Phase 5 — Move into feature folders
- Move files only after their responsibility and dependency direction are stable.
- Update imports in small batches and verify after each batch.
- Do not combine folder migration with business behavior changes.

## 7. Quality gates for each refactor batch

- TypeScript check: `npm run lint`.
- Production build: `npm run build`.
- Relevant unit tests (existing test files currently exist, but package.json does not expose a test script).
- Manual smoke checks: login/demo session, floor/table, new order, add batch, Payment First, Payment Last, cash, demo QRIS/card, KDS, waiter checker, stock/restock, receipt, finance, Google Sheets.
- Compare before/after behavior; record any intentional behavior change separately.
- No merge to `main` without team review.

## 8. First implementation batch recommendation

After this map is reviewed, the safest first code batch is documentation-only:
1. Add file headers to `App.tsx`, `posCalculations.ts`, `authRoles.ts`, `OrderModal.tsx`, `PaymentModal.tsx`, `KDSModal.tsx`, and `WaiterCheckerModal.tsx`.
2. Add function-level docs to exported business functions, particularly calculations and state-transition helpers.
3. Do not relocate files or change runtime logic in this batch.

The next substantive refactor should extract pure functions from `posCalculations.ts`, protected by the existing tests.

## 9. Review checklist

- [ ] Does every module have one clear responsibility?
- [ ] Are business rules separated from UI rendering?
- [ ] Are side effects and persistence boundaries explicit?
- [ ] Are demo-only behaviors clearly labeled?
- [ ] Do comments explain intent and edge cases instead of restating code?
- [ ] Can a new team member find order, payment, KDS, inventory, finance, auth, and printing logic quickly?
- [ ] Are build, type-check, and relevant tests green?
- [ ] Has the team confirmed no unintended POS behavior change?

---
**Audit note:** This map was created from the repository tree and source imports/exports on `main`. It is an initial ownership map, not a complete call graph. Validate each proposed move against all imports, tests, and runtime flows before changing file locations.
