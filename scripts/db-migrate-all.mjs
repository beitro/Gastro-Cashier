import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import pg from 'pg';

const execFileAsync = promisify(execFile);
const { Client } = pg;

const adminUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
const rlsSecret = process.env.RLS_CONTEXT_HMAC_SECRET;
const runtimeRole = process.env.RUNTIME_DB_ROLE || 'gastro_runtime';

if (!adminUrl) {
  throw new Error('ADMIN_DATABASE_URL (or DATABASE_URL) is required.');
}
if (process.env.CONFIRM_DEV_MIGRATION_ALL !== 'YES') {
  throw new Error(
    'Refusing full migration sequence. Inspect target with npm run db:check, then set CONFIRM_DEV_MIGRATION_ALL=YES for non-production/preview branches.'
  );
}
if (!rlsSecret || Buffer.byteLength(rlsSecret, 'utf8') < 32) {
  throw new Error('RLS_CONTEXT_HMAC_SECRET (>= 32 bytes) is required to provision the signed RLS key.');
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationLock = 'gastro_cashier_dev_migrate_all';

const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10000 });

try {
  await client.connect();
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [migrationLock]);

  const meta = await client.query(`
    SELECT current_database() AS database, current_user AS role,
           current_setting('server_version') AS version
  `);

  const existing = await client.query(`
    SELECT count(*)::int AS count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')
      AND c.relname NOT LIKE 'pg_%'
  `);

  const stepsRun = [];

  if (existing.rows[0].count === 0) {
    const baselinePath = path.join(rootDir, 'db/migrations/001_initial.sql');
    const baselineSql = await readFile(baselinePath, 'utf8');
    await client.query(baselineSql);
    stepsRun.push('001_initial.sql');
  }

  const orderedMigrations = [
    'db/migrations/002_staff_sessions.sql',
    'db/migrations/002_rls_runtime_hardening.sql',
    'db/migrations/003_auth_support_tables.sql',
    'db/migrations/003_staff_admin_management.sql',
    'db/migrations/004_signed_rls_context.sql',
    'db/migrations/006_menu_stock_and_payment_settlement.sql',
  ];

  for (const relPath of orderedMigrations) {
    const sql = await readFile(path.join(rootDir, relPath), 'utf8');
    await client.query(sql);
    stepsRun.push(path.basename(relPath));
  }

  const childEnv = {
    ...process.env,
    ADMIN_DATABASE_URL: adminUrl,
    RLS_CONTEXT_HMAC_SECRET: rlsSecret,
    RUNTIME_DB_ROLE: runtimeRole,
  };

  await execFileAsync(process.execPath, [path.join(rootDir, 'scripts/db-provision-rls-context-key.mjs')], {
    cwd: rootDir,
    env: childEnv,
  });
  stepsRun.push('db-provision-rls-context-key.mjs');

  await execFileAsync(process.execPath, [path.join(rootDir, 'scripts/db-provision-runtime-role.mjs')], {
    cwd: rootDir,
    env: childEnv,
  });
  stepsRun.push('db-provision-runtime-role.mjs');

  const emergencySql = await readFile(path.join(rootDir, 'db/migrations/005_emergency_staff_readonly.sql'), 'utf8');
  await client.query(emergencySql);
  stepsRun.push('005_emergency_staff_readonly.sql');

  console.log(
    JSON.stringify(
      {
        migrationAll: 'success',
        database: meta.rows[0].database,
        adminRole: meta.rows[0].role,
        runtimeRole,
        postgresVersion: meta.rows[0].version,
        stepsRun,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error('Full migration sequence stopped:', error.message);
  process.exitCode = 1;
} finally {
  await client.query('SELECT pg_advisory_unlock(hashtext($1))', [migrationLock]).catch(() => {});
  await client.end().catch(() => {});
}
