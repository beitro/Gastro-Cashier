import pg from 'pg';

const { Client } = pg;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Set it in your local environment or deployment secret.');
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const meta = await client.query(`
    SELECT current_database() AS database, current_user AS role,
           current_setting('server_version') AS version
  `);
  const objects = await client.query(`
    SELECT count(*)::int AS count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')
      AND c.relname NOT LIKE 'pg_%'
  `);
  const tables = await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  console.log(JSON.stringify({
    connection: 'successful',
    database: meta.rows[0].database,
    role: meta.rows[0].role,
    postgresVersion: meta.rows[0].version,
    publicObjectCount: objects.rows[0].count,
    publicTables: tables.rows.map((row) => row.tablename),
    migrationRecommendation: objects.rows[0].count === 0 ? 'empty-schema-candidate' : 'inspect-existing-schema-before-migration',
  }, null, 2));
} catch (error) {
  console.error('Read-only database inspection failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
