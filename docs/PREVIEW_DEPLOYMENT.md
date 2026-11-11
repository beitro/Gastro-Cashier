# Gastro-Cashier Preview Deployment

This document describes the preview-only deployment split. It does not authorize production deployment.

## Target topology

- Vercel Hobby: frontend preview (React/Vite).
- Coolify: persistent Node.js/Express API container built from this repository's Dockerfile.
- Neon: development database branch `gastro-test-seed` only.
- GitHub: source of truth; deploy branch `feat/menu-stock-transaction-audit`.

Do not point preview services at the production Neon branch.

## Coolify API service

Create a Dockerfile-based application from this repository:

- Repository: `beitro/Gastro-Cashier`
- Branch: `feat/menu-stock-transaction-audit`
- Dockerfile: `/Dockerfile`
- Exposed port: `8080`
- Health check path: `/api/health`
- Persistent volume: not required for this stateless API preview.

Configure these environment variables in Coolify's secret/environment UI:

- `NODE_ENV=production`
- `PORT=8080`
- `PGSSL=true`
- `TRUST_PROXY_HOPS=1`
- `PGPOOL_MAX=5`
- `DATABASE_URL`: Neon connection string for `gastro-test-seed`, using the dedicated `gastro_runtime` role. Never use a Neon owner/admin connection string.
- `RLS_CONTEXT_HMAC_SECRET`: generated secret with at least 32 bytes.

Do not commit secrets to GitHub, put them in Docker build arguments, or paste them into chat. Do not configure `BOOTSTRAP_DATABASE_URL` for the normal runtime service.

After deploy, verify `GET /api/health`, then verify database identity and runtime role before running E2E tests.

## Vercel frontend

Vercel should build the frontend from the same preview branch. Once the Coolify API has a stable HTTPS domain, set:

- `VITE_API_BASE_URL`: the public Coolify API origin, with no trailing slash.

The API currently needs an explicit CORS allowlist for the final Vercel preview origin before browser calls are enabled cross-origin. Do not enable wildcard CORS. Add the exact Vercel origin to the API allowlist and test OPTIONS preflight before exposing the preview.

## Safety gates

1. Confirm Coolify is connected to the intended GitHub repository and preview branch.
2. Confirm `DATABASE_URL` resolves to Neon project `billowing-pond-35727408`, branch `gastro-test-seed` (`br-fancy-lake-be3pr6o9`), database `Gastro Cashier`, runtime role `gastro_runtime`.
3. Run the health check and inspect startup logs.
4. Run the inventory/settlement E2E suite only against the development branch.
5. Do not merge PR #19 or change production credentials as part of preview setup.

## Resource note

Oracle Cloud Always Free Ampere A1 is an optional hosting target, not a guarantee of capacity. Current documented Always Free allowance is 2 OCPUs and 12 GB RAM total, with 200 GB combined block volume. Capacity may not be available in every home region, and idle compute instances may be reclaimed. Check the tenancy's usage/limits and confirm the instance is marked Always Free before creating it.
