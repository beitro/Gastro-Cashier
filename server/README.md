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

## API routes

- `GET /api/health` — PostgreSQL connectivity and server version.
- `POST /api/bootstrap` — one-time tenant/outlet/owner provisioning; requires bootstrap header.
- `POST /api/auth/pin` — server-side PIN verification and 12-hour bearer session.
- `POST /api/auth/nfc` — server-side NFC UID verification and bearer session.
- `POST /api/auth/logout` — revoke current bearer session.
- `GET /api/me` — current staff, tenant, and outlet context.
- `GET /api/tables` — current outlet table board, protected by RLS transaction context.

Bearer token is stored in browser localStorage for this initial integration stage. Use HTTPS in production and move the token to a Secure, HttpOnly, SameSite cookie before public deployment.

## Current integration boundary

PIN/NFC authentication and the table-board read path are database-backed. The remaining POS write paths (session open/close, order batches and KDS updates, payments/refunds, inventory movements, petty cash, and finance reporting) still need to be migrated from localStorage into transactional API endpoints before this app can be considered fully multi-device or production-ready. Do not treat browser localStorage as a shared or authoritative database.
