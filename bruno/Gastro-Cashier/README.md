# Gastro-Cashier transaction audit (Bruno)

Import this folder into Bruno as a collection and select the **Development** environment.

## Environment setup

Set:
- `baseUrl`: isolated development API preview URL (never production)
- `cashierPin`: PIN for a cashier or Owner account allowed to create POS orders
- `approverPin`: PIN for a Manager or Owner account; Finance may confirm payment settlement
- `tableId`: UUID of an available dining table
- `menuItemId`: UUID of a menu item whose stock is tracked

The API must already be configured with the development Neon branch, signed RLS context secret and least-privilege `gastro_runtime` role. The collection does not contain credentials.

## Recommended sequence

1. Login Cashier.
2. Login Manager or Owner (the endpoint accepts either role for stock adjustment/cancellation; settlement also accepts Finance).
3. Adjust Menu Stock: set quantity to 1 and `trackStock=true`.
4. Open Session.
5. Create Order. Save the returned `orderItemId`.
6. Cancel Order Item (Manager/Owner). Verify the menu stock returns to 1.
7. Create Order After Cancellation. This creates a fresh billable item after the cancelled item.
8. Create QRIS Pending. Verify `status=pending` and `paid_at=null`.
9. Confirm Settlement (Manager/Owner/Finance) with a provider reference that has been independently verified.

For cash, use `method: "cash"` and provide `cashReceived` greater than or equal to the server-calculated total; it settles immediately. For card and transfer, change the payment method in the request body and keep the payment pending until an authorized staff member confirms it.

## Concurrency test

The collection demonstrates individual requests. To test two cashiers at once:
- Set a menu item's tracked stock to exactly 1.
- Open two different dining sessions on separate tables.
- Send Create Order from two separate Bruno tabs at nearly the same time, each with a different idempotency key and the same `menuItemId`.
- Expected: one HTTP 201, one HTTP 409 with `INSUFFICIENT_MENU_STOCK`; final stock 0; exactly one `sale` movement.

For the full automated matrix (stock race, idempotency, Manager/Owner cancellation, and cash/QRIS/card/transfer settlement), run `npm run test:e2e:inventory` against the isolated Preview API.

**Payment boundary:** this implementation does not connect to a live QRIS aggregator, card acquirer, or bank transfer provider. The settlement endpoint records an authorized manual confirmation and reference; it must not be treated as a provider webhook or automatic payment verification.
