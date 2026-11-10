import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
const tenantId = process.env.NEON_RLS_TEST_TENANT_ID;
const outletId = process.env.NEON_RLS_TEST_OUTLET_ID;
if (!connectionString || !tenantId || !outletId) {
  throw new Error('DATABASE_URL, NEON_RLS_TEST_TENANT_ID and NEON_RLS_TEST_OUTLET_ID are required.');
}
for (const [name, value] of [['NEON_RLS_TEST_TENANT_ID', tenantId], ['NEON_RLS_TEST_OUTLET_ID', outletId]]) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(name + ' must be a UUID.');
}
const c = new Client({ connectionString, connectionTimeoutMillis: 10000, statement_timeout: 15000, query_timeout: 20000 });
const fail = message => { throw new Error('[runtime-rls-verify] ' + message); };
try {
  await c.connect();
  const meta = await c.query(`SELECT current_user, current_database(), current_setting('server_version') AS version,
    r.rolsuper,r.rolbypassrls,r.rolinherit,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
    EXISTS(SELECT 1 FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname='public' AND x.relkind IN ('r','p','v','m','S') AND x.relowner=r.oid) AS owns_objects,
    EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner=r.oid) AS owns_schema,
    EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS has_memberships,
    has_schema_privilege(current_user,'public','CREATE') AS can_create_public_objects,
    has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schemas
    FROM pg_roles r WHERE r.rolname=current_user`);
  const role=meta.rows[0];
  if (!role || role.current_user !== (process.env.NEON_RUNTIME_DB_ROLE || 'gastro_runtime') ||
      role.rolsuper || role.rolbypassrls || role.rolinherit || role.rolcreatedb || role.rolcreaterole || role.rolreplication ||
      role.owns_objects || role.owns_schema || role.has_memberships || role.can_create_public_objects || role.can_create_schemas) fail('connected role is not a safe dedicated runtime role.');
  const audit=await c.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity)::int AS protected
    FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')`);
  if (audit.rows[0].total < 1 || audit.rows[0].total !== audit.rows[0].protected) fail('not all public tables have ENABLE and FORCE ROW LEVEL SECURITY.');
  const view=await c.query("SELECT reloptions FROM pg_class WHERE oid='public.v_table_board'::regclass");
  if (!view.rows[0]?.reloptions?.includes('security_invoker=true')) fail('v_table_board is not security_invoker.');

  await c.query('BEGIN');
  const noContext = await c.query(`SELECT
    (SELECT count(*) FROM tenants)::int AS tenants,
    (SELECT count(*) FROM outlets)::int AS outlets,
    (SELECT count(*) FROM tenant_memberships)::int AS tenant_memberships,
    (SELECT count(*) FROM outlet_memberships)::int AS outlet_memberships,
    (SELECT count(*) FROM staff_accounts)::int AS staff_accounts,
    (SELECT count(*) FROM staff_sessions)::int AS staff_sessions,
    (SELECT count(*) FROM dining_tables)::int AS dining_tables,
    (SELECT count(*) FROM v_table_board)::int AS table_board,
    (SELECT count(*) FROM auth_rate_limits)::int AS auth_rate_limits`);
  if (Object.values(noContext.rows[0]).some(Number)) fail('query without tenant/outlet context returned rows: ' + JSON.stringify(noContext.rows[0]));

  await c.query("SELECT set_config('app.auth_lookup','true',true)");
  const auth = await c.query('SELECT count(*)::int AS n FROM staff_accounts');
  if (auth.rows[0].n < 1) fail('explicit auth lookup found no staff accounts; cannot validate real auth visibility.');
  if (Number((await c.query('SELECT count(*)::int AS n FROM staff_sessions')).rows[0].n) !== 0) fail('auth lookup exposed staff sessions.');

  await c.query("SELECT set_config('app.auth_lookup','false',true), set_config('app.tenant_id',$1,true), set_config('app.outlet_id',$2,true)", [tenantId, outletId]);
  const outlet = await c.query('SELECT id FROM outlets WHERE id=$1 AND tenant_id=$2', [outletId, tenantId]);
  if (outlet.rowCount !== 1) fail('configured RLS test outlet is not visible under the configured tenant.');
  const tables = await c.query('SELECT tenant_id,outlet_id FROM dining_tables');
  if (tables.rows.some(r => r.tenant_id !== tenantId || r.outlet_id !== outletId)) fail('dining_tables leaked rows outside configured tenant/outlet.');
  const board = await c.query('SELECT tenant_id,outlet_id FROM v_table_board');
  if (board.rows.some(r => r.tenant_id !== tenantId || r.outlet_id !== outletId)) fail('v_table_board leaked rows outside configured tenant/outlet.');
  const sessions = await c.query('SELECT tenant_id,outlet_id FROM dining_sessions');
  if (sessions.rows.some(r => r.tenant_id !== tenantId || r.outlet_id !== outletId)) fail('dining_sessions leaked rows outside configured tenant/outlet.');
  const staff = await c.query('SELECT id FROM staff_accounts');
  if (staff.rowCount < 1) fail('tenant-scoped staff lookup returned no rows for configured test tenant.');
  await c.query("SELECT set_config('app.outlet_id',$1,true)", [randomUUID()]);
  const wrongOutlet = await c.query('SELECT id FROM dining_tables');
  if (wrongOutlet.rowCount !== 0) fail('a different outlet context returned dining table rows.');
  await c.query('ROLLBACK');
  console.log(JSON.stringify({
    verified: true,
    database: meta.rows[0].current_database,
    postgresVersion: meta.rows[0].version,
    runtimeRole: role.current_user,
    rls: { allPublicTablesForced: true, noContextDenied: true, authLookupScoped: true, tenantOutletIsolation: true, viewInvoker: true, wrongOutletDenied: true },
    testTenantId: tenantId,
    testOutletId: outletId
  }, null, 2));
} catch (error) {
  await c.query('ROLLBACK').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
