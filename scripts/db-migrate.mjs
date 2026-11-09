import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; migration was not run.');
if (process.env.CONFIRM_EMPTY_DATABASE_MIGRATION !== 'YES') {
  throw new Error('Refusing migration. Run npm run db:check, inspect the target, then explicitly set CONFIRM_EMPTY_DATABASE_MIGRATION=YES.');
}

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const migrationLock = 'gastro_cashier_baseline_migration';
try {
  await client.connect();
  // A session-level advisory lock closes the check/apply race across concurrent deploys.
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [migrationLock]);
  const state = await client.query(`
    SELECT current_database() AS database, current_user AS role,
           current_setting('server_version') AS version
  `);
  const existing = await client.query(`
    SELECT c.relname, c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')
      AND c.relname NOT LIKE 'pg_%'
    ORDER BY c.relname
  `);
  if (existing.rowCount > 0) {
    throw new Error(`Refusing baseline migration on non-empty database "${state.rows[0].database}". Found ${existing.rowCount} public objects; no schema changes applied.`);
  }

  const schemaPath = fileURLToPath(new URL('../schema.sql', import.meta.url));
  const schema = await readFile(path.resolve(schemaPath), 'utf8');
  // schema.sql owns its transaction. The advisory lock remains held on this session
  // while the schema transaction runs, so a second migration cannot pass the check.
  await client.query(schema);

  const verify = await client.query(`
    SELECT to_regclass('public.tenants') AS tenants,
           to_regclass('public.dining_sessions') AS dining_sessions,
           to_regclass('public.menu_items') AS menu_items,
           to_regclass('public.staff_sessions') AS staff_sessions,
           to_regclass('public.v_table_board') AS table_board
  `);
  const row = verify.rows[0];
  if (!row.tenants || !row.dining_sessions || !row.menu_items || !row.staff_sessions || !row.table_board) {
    throw new Error('Post-migration verification failed. Inspect database state before retrying.');
  }
  console.log(JSON.stringify({
    migration: 'success',
    database: state.rows[0].database,
    postgresVersion: state.rows[0].version,
    verified: ['tenants', 'dining_sessions', 'menu_items', 'staff_sessions', 'v_table_board']
  }, null, 2));
} catch (error) {
  console.error('Migration stopped:', error.message);
  process.exitCode = 1;
} finally {
  await client.query('SELECT pg_advisory_unlock(hashtext($1))', [migrationLock]).catch(() => {});
  await client.end().catch(() => {});
}
