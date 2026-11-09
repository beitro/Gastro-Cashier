// Provision a least-privileged application role on the existing Neon database.
// Run only through the guarded workflow with owner URL + a separately stored password secret.
import pg from 'pg';

const { Client } = pg;
const ownerUrl = process.env.NEON_DATABASE_URL;
const password = process.env.GASTRO_RUNTIME_DB_PASSWORD;
if (!ownerUrl || !password) throw new Error('NEON_DATABASE_URL and GASTRO_RUNTIME_DB_PASSWORD are required');
if (password.length < 32) throw new Error('GASTRO_RUNTIME_DB_PASSWORD must be at least 32 characters');

const client = new Client({ connectionString: ownerUrl, connectionTimeoutMillis: 10000 });
const role = 'gastro_runtime';
const quoteLiteral = (value) => "'" + value.replaceAll("'", "''") + "'";

try {
  await client.connect();
  const meta = await client.query('SELECT current_database() AS database, current_user AS role');
  if (meta.rows[0].database !== 'Gastro Cashier') {
    throw new Error(`Refusing to provision role on unexpected database: ${meta.rows[0].database}`);
  }
  if (meta.rows[0].role === role) throw new Error('Refusing to use the runtime role as the provisioning identity');

  await client.query('BEGIN');
  const existing = await client.query('SELECT rolname FROM pg_roles WHERE rolname = $1', [role]);
  if (existing.rowCount) {
    await client.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  } else {
    await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  }

  await client.query(`GRANT CONNECT ON DATABASE "Gastro Cashier" TO ${role}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  // Staff identity records remain inaccessible to the app role until a dedicated,
  // narrowly scoped Firebase-UID lookup design is added.
  await client.query(`
    DO $grant$
    DECLARE item RECORD;
    BEGIN
      FOR item IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'staff_accounts'
      LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO gastro_runtime', item.tablename);
      END LOOP;
    END
    $grant$
  `);
  await client.query(`GRANT SELECT ON TABLE public.v_table_board TO ${role}`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await client.query(`REVOKE ALL ON TABLE public.staff_accounts FROM ${role}`);
  await client.query('COMMIT');

  const verify = await client.query(`
    SELECT r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolinherit, r.rolbypassrls,
      has_table_privilege('gastro_runtime','public.staff_accounts','SELECT') AS can_read_staff_accounts,
      has_table_privilege('gastro_runtime','public.dining_tables','SELECT') AS can_read_dining_tables,
      has_table_privilege('gastro_runtime','public.dining_tables','INSERT') AS can_insert_dining_tables,
      has_table_privilege('gastro_runtime','public.v_table_board','SELECT') AS can_read_table_board
    FROM pg_roles r WHERE r.rolname = 'gastro_runtime'
  `);
  const v = verify.rows[0];
  if (!v.rolcanlogin || v.rolsuper || v.rolcreatedb || v.rolcreaterole || v.rolinherit || v.rolbypassrls ||
      v.can_read_staff_accounts || !v.can_read_dining_tables || !v.can_insert_dining_tables || !v.can_read_table_board) {
    throw new Error('Runtime role privilege verification failed');
  }
  console.log(JSON.stringify({
    provisioning: 'success',
    database: meta.rows[0].database,
    provisioningRole: meta.rows[0].role,
    runtimeRole: role,
    login: v.rolcanlogin,
    superuser: v.rolsuper,
    createDatabase: v.rolcreatedb,
    createRole: v.rolcreaterole,
    inherit: v.rolinherit,
    bypassRls: v.rolbypassrls,
    staffAccountsAccessible: v.can_read_staff_accounts,
    diningTablesReadWrite: v.can_read_dining_tables && v.can_insert_dining_tables,
    tableBoardReadable: v.can_read_table_board
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Runtime role provisioning stopped:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
