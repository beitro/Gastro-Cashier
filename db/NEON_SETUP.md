# Neon PostgreSQL setup

The repository contains a PostgreSQL-backed API foundation, guarded baseline schema, incremental RLS migration, and a gated production deployment workflow. The React POS screens are not yet fully migrated from localStorage; refunds, inventory movements, petty cash, finance reporting, and multi-outlet selection remain incomplete. Do not treat the application as production-ready multi-device POS.

## Read-only inspection

Set the server-only Neon connection string as `DATABASE_URL` and run:

```bash
npm install
npm run db:check
```

The Neon read-only workflow inspects metadata only. It never applies migrations or writes to the hosted database.

## Baseline migration

`npm run db:migrate` is for a separately confirmed empty database only. It is not appropriate for the existing Neon database.

## Gated production RLS deployment

The workflow `.github/workflows/neon-production-deploy.yml` is deliberately manual-only (`workflow_dispatch`) and does not run on pull requests. It is not executable against Neon until PR #7 is merged to the default branch and the repository owner has configured the GitHub Environment below. **Creating this workflow does not deploy or connect to Neon.**

### 1. Configure the GitHub Environment approval gate

In repository Settings → Environments, create `neon-production` and configure **Required reviewers** (at least one trusted human reviewer). Enable prevention of self-review if available. Do not rely on the workflow's environment name alone: GitHub only blocks the job for approval when the environment is configured with required reviewers. Restrict deployment branch/tag rules to the default branch.

### 2. Configure GitHub Actions secrets

Add these as **repository Actions secrets** (not only Environment secrets), because the first job must create the backup before the production approval gate. Never commit values or paste them into chat.

| Secret | Purpose |
|---|---|
| `NEON_ADMIN_DATABASE_URL` | Admin/schema-owner connection for the exact Neon project, branch and database; TLS required |
| `NEON_EXPECTED_HOST` | Exact Neon hostname from that connection URL |
| `NEON_EXPECTED_DATABASE` | Exact database name from that connection URL |
| `NEON_BACKUP_PASSPHRASE` | Random encryption passphrase, at least 32 characters |
| `NEON_RUNTIME_DB_PASSWORD` | New random password for `gastro_runtime`, at least 24 characters |
| `NEON_RLS_TEST_TENANT_ID` | UUID of a real tenant used for read-only RLS verification |
| `NEON_RLS_TEST_OUTLET_ID` | UUID of an existing outlet belonging to that tenant |

The admin connection must own the public schema and all application relations and have CREATEROLE. The workflow stops if ownership, database identity, schema shape, or role prerequisites do not match. The runtime password should be generated specifically for this deployment and stored only as a secret.

### 3. Run only after review

After PR #7 is merged, open Actions → **Neon production RLS deployment** → Run workflow and select `DEPLOY`. The backup job first checks the exact Neon identity, creates an encrypted PostgreSQL custom-format logical backup, verifies it byte-for-byte, checks the archive, fully restores it into an isolated disposable PostgreSQL 18 database, and uploads only the encrypted backup plus checksum as a 30-day artifact. **Only after that job succeeds does the `deploy` job pause at the `neon-production` Environment for required human approval.** After approval it downloads and re-verifies the backup, revalidates the exact target, schema ownership, expected relations and PostgreSQL version, applies only `db/migrations/002_rls_runtime_hardening.sql`, provisions the least-privilege `gastro_runtime` role, and performs read-only RLS checks through the actual runtime login.

Every step is fail-fast. Migration cannot start if backup creation, encryption/decryption, archive validation, full restore, artifact upload, approval, backup re-verification, or pre-migration checks fail. A failure after migration prevents later steps and must be handled using the verified backup and a reviewed recovery plan; the workflow does not attempt automatic rollback of a production schema migration.

### Important operational notes

- The encrypted backup artifact is sensitive. Limit repository Actions/artifact access to trusted operators, retrieve it only through authorized GitHub access, and retain a separately managed backup according to your recovery policy.
- This is a logical backup, not a Neon point-in-time recovery setting. Confirm Neon backup/PITR retention separately.
- The RLS verification requires the configured tenant and outlet to exist and have at least one staff account. It performs SELECT-only checks; it does not insert fixtures or delete production rows.
- Provisioning updates the password and grants for `gastro_runtime`. Review existing role usage before dispatching; do not reuse the role for unrelated services.
- After successful verification, set the API's server-only `DATABASE_URL` to the `gastro_runtime` connection string and keep admin credentials out of the API runtime. The workflow does not modify application hosting secrets or restart the API.
- `BOOTSTRAP_DATABASE_URL` remains a separate temporary privileged connection for the token-protected bootstrap endpoint; remove it after one-time provisioning.
- Bearer tokens are currently held in browser localStorage. Move to Secure/HttpOnly/SameSite cookies before public deployment.
