// [harden-neon-view] guarded one-time Neon view security patch.
import pg from 'pg';

const { Client } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000
});

try {
  await client.connect();
  const target = await client.query(`
    SELECT current_database() AS database, current_user AS role,
           to_regclass('public.v_table_board') AS board,
           pg_get_viewdef('public.v_table_board'::regclass, true) AS definition
  `);
  const row = target.rows[0];
  if (row.database !== 'Gastro Cashier') {
    throw new Error(`Refusing to harden unexpected database: ${row.database}`);
  }
  if (!row.board || !row.definition.includes('dining_tables') || !row.definition.includes('dining_sessions')) {
    throw new Error('Expected v_table_board definition was not found; no changes applied');
  }

  await client.query(`
    CREATE OR REPLACE VIEW public.v_table_board
    WITH (security_invoker = true)
    AS
    SELECT t.tenant_id,t.outlet_id,t.id AS table_id,t.table_code,t.display_name,t.area,t.capacity,t.is_active,
     CASE WHEN s.status='billing' THEN 'billing' WHEN s.status='active' THEN 'occupied' ELSE 'available' END AS table_state,
     s.id AS session_id,s.session_number,s.guest_count,s.opened_at,s.waiter_staff_id,s.version AS session_version
    FROM public.dining_tables t
    LEFT JOIN public.dining_sessions s
      ON s.tenant_id=t.tenant_id AND s.outlet_id=t.outlet_id AND s.table_id=t.id
      AND s.status IN ('active','billing')
  `);

  const verify = await client.query(`
    SELECT c.reloptions,
           c.reloptions @> ARRAY['security_invoker=true'] AS security_invoker,
           (SELECT count(*)::int FROM pg_policies WHERE schemaname='public') AS policy_count,
           (SELECT count(*)::int FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace
             WHERE n.nspname='public' AND x.relkind IN ('r','p') AND x.relrowsecurity) AS rls_table_count
    FROM pg_class c
    WHERE c.oid='public.v_table_board'::regclass
  `);
  if (!verify.rows[0].security_invoker) throw new Error('v_table_board security_invoker verification failed');
  if (verify.rows[0].policy_count < 25) throw new Error('Unexpectedly low RLS policy count');
  console.log(JSON.stringify({
    hardening: 'success',
    database: row.database,
    role: row.role,
    view: 'v_table_board',
    securityInvoker: verify.rows[0].security_invoker,
    rlsPolicyCount: verify.rows[0].policy_count,
    rlsEnabledTableCount: verify.rows[0].rls_table_count
  }, null, 2));
} catch (error) {
  console.error('Neon view hardening stopped:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
