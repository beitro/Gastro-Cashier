import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Migration was not run.');
  process.exit(1);
}
if (process.env.CONFIRM_EMPTY_DATABASE_MIGRATION !== 'YES') {
  console.error('Refusing to migrate. First run npm run db:check, inspect the target database, then set CONFIRM_EMPTY_DATABASE_MIGRATION=YES only if it is safe and empty.');
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query('BEGIN');
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
    throw new Error(`Refusing to modify non-empty public schema in database "${state.rows[0].database}". Found ${existing.rowCount} existing objects. No schema changes were applied.`);
  }
  const schemaPath = fileURLToPath(new URL('../schema.sql', import.meta.url));
  const schema = await readFile(path.resolve(schemaPath), 'utf8');
  // The canonical schema owns its BEGIN/COMMIT statements. It is applied only
  // after the read-only emptiness check above; never run against an unknown schema.
  await client.query('ROLLBACK');
  await client.query(schema);
  const verify = await client.query(`
    SELECT to_regclass('public.tenants') AS tenants,
           to_regclass('public.dining_sessions') AS dining_sessions,
           to_regclass('public.menu_items') AS menu_items,
           to_regclass('public.v_table_board') AS table_board
  `);
  if (!verify.rows[0].tenants || !verify.rows[0].dining_sessions ||
      !verify.rows[0].menu_items || !verify.rows[0].table_board) {
    throw new Error('Post-migration verification failed. Review database state before retrying.');
  }
  console.log(JSON.stringify({
    migration: 'success',
    database: state.rows[0].database,
    postgresVersion: state.rows[0].version,
    verified: ['tenants', 'dining_sessions', 'menu_items', 'v_table_board'],
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Migration stopped:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
