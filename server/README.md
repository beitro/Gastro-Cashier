# Gastro-Cashier API integration

The Express API in `server/index.mjs` uses PostgreSQL 15 as its source for staff authentication and outlet table-board reads. The frontend PIN/NFC login now calls this API; the previous browser-only PIN/NFC verification is no longer used for successful login.

## Configure and start

1. Create an empty PostgreSQL 15 database and apply the canonical schema:

   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql`

2. Configure server-only variables in `.env` (copy `.env.example`):

   - `DATABASE_URL` — PostgreSQL connection string; never prefix with `VITE_`.
   - `BOOTSTRAP_TOKEN` — long random secret used only for initial owner provisioning.
   - `PORT=8080`; optionally `PGSSL=true` when the provider requires TLS.

3. Install dependencies and run `npm run dev`. Vite proxies `/api` to the Express service.

4. Provision the first tenant, outlet, and owner exactly once:

```bash
curl -X POST http://localhost:8080/api/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: $BOOTSTRAP_TOKEN" \
  -d '{"tenantName":"My Restaurant","tenantSlug":"my-restaurant","outletName":"Main Outlet","outletSlug":"main","staffName":"Restaurant Owner","email":"owner@example.com","pin":"CHANGE-ME"}'
```

The PIN must be 4–8 digits. Bootstrap stores a salted scrypt hash, not the raw PIN. Do not use the example PIN in a real deployment. NFC provisioning accepts an optional `nfcUid`; only its salted hash is stored. Disable/remove `BOOTSTRAP_TOKEN` after initial provisioning.

## Security controls

- PIN and NFC login attempts are throttled in PostgreSQL per client IP (five attempts per 15-minute window, then a 30-second block); the stored key is a SHA-256 hash, not the raw IP.
- If deployed behind a reverse proxy, set `TRUST_PROXY_HOPS` only to the exact trusted proxy count.
- POS routes require an active Owner or Cashier role. Finance and unknown role codes are denied; role normalization fails closed.
- A requested waiter must be an active member of the same tenant and outlet.
- Payment idempotency keys are bound to the same session and payment payload; reusing a key for a different payload returns HTTP 409.
- Bootstrap is serialized and can create the initial tenant only once.

## API routes

- `GET /api/health` — PostgreSQL connectivity and server version.
- `POST /api/bootstrap` — one-time tenant/outlet/owner provisioning; requires bootstrap header.
- `POST /api/auth/pin` — server-side PIN verification and 12-hour bearer session.
- `POST /api/auth/nfc` — server-side NFC UID verification and bearer session.
- `POST /api/auth/logout` — revoke current bearer session.
- `GET /api/me` — current staff, tenant, and outlet context.
- `GET /api/tables` — current outlet table board, protected by RLS transaction context.
- `GET /api/menu` — available outlet/global menu catalog.
- `GET /api/sessions` — active/billing table sessions.
- `POST /api/sessions` — open a table session; validates table capacity and prevents concurrent open sessions.
- `GET /api/sessions/:sessionId/orders` — list order batches and items for a session.
- `POST /api/sessions/:sessionId/orders` — create a submitted order batch; menu prices and names are loaded server-side.
- `PATCH /api/order-items/:itemId/kitchen-status` — update KDS status (`queue`, `cooking`, `ready`, `handed_off`, `cancelled`).
- `POST /api/sessions/:sessionId/payments` — settle a session in one database transaction, allocate payment to items, close session, and enforce an idempotency key.

Bearer token is stored in browser localStorage for this initial integration stage. Use HTTPS in production and move the token to a Secure, HttpOnly, SameSite cookie before public deployment.

## Current integration boundary

The backend now exposes the core API building blocks for authentication, menu, tables, sessions, order batches, KDS status, and full-session settlement. The current React screens have not yet been switched wholesale to these endpoints; some existing POS state, refunds, inventory movements, petty cash, and finance reporting still use browser storage. Complete UI data hydration, refund/inventory/finance endpoints, runtime-role RLS validation, and integration tests before production or multi-device use. Do not treat browser localStorage as a shared or authoritative database.
