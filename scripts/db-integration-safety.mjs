import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const opts = { connectionString, connectionTimeoutMillis: 10000, statement_timeout: 15000, query_timeout: 20000 };
const admin = new Client(opts), runtime = new Client(opts), contender = new Client(opts);
const phase = name => console.log(`[db-safety] ${name}`);
const ids = { tenantA:randomUUID(), tenantB:randomUUID(), outletA:randomUUID(), outletOtherA:randomUUID(), outletB:randomUUID(), tableA:randomUUID(), tableB:randomUUID(), staffA:randomUUID(), staffB:randomUUID(), staffSessionA:randomUUID(), diningSessionA:randomUUID(), diningSessionB:randomUUID() };
const slug = randomUUID().replaceAll('-','').slice(0,16);
async function assertDenied(client, sql, values, label) {
  await client.query('SAVEPOINT rls_guard');
  try { await client.query(sql,values); await client.query('ROLLBACK TO SAVEPOINT rls_guard'); throw new Error(`${label}: write unexpectedly succeeded`); }
  catch (error) { await client.query('ROLLBACK TO SAVEPOINT rls_guard'); if (error.message.includes('unexpectedly succeeded')) throw error; if (error.code !== '42501') throw new Error(`${label}: expected RLS denial, received ${error.code || error.message}`); }
  finally { await client.query('RELEASE SAVEPOINT rls_guard'); }
}

try {
  phase('connect and verify non-owner runtime role');
  await admin.connect();
  await admin.query("SET lock_timeout='8s'; SET idle_in_transaction_session_timeout='30s'");
  await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gastro_runtime_test') THEN CREATE ROLE gastro_runtime_test NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$; ALTER ROLE gastro_runtime_test NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT gastro_runtime_test TO CURRENT_USER; GRANT USAGE ON SCHEMA public TO gastro_runtime_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO gastro_runtime_test; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO gastro_runtime_test;`);
  const role = await admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='gastro_runtime_test'");
  if (role.rows[0].rolsuper || role.rows[0].rolbypassrls) throw new Error('Runtime role can bypass RLS');
  const tableAudit = await admin.query("SELECT count(*)::int AS total,count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity)::int AS protected FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')");
  if (tableAudit.rows[0].total !== tableAudit.rows[0].protected) throw new Error(`Not every public table FORCE RLS (${tableAudit.rows[0].protected}/${tableAudit.rows[0].total})`);
  const view = await admin.query("SELECT reloptions FROM pg_class WHERE oid='public.v_table_board'::regclass");
  if (!view.rows[0]?.reloptions?.includes('security_invoker=true')) throw new Error('v_table_board is not security_invoker');

  phase('seed isolated tenant, outlet, staff and session fixtures');
  await admin.query('BEGIN');
  await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3),($4,$5,$6)',[ids.tenantA,`rls-a-${slug}`,'Tenant A',ids.tenantB,`rls-b-${slug}`,'Tenant B']);
  await admin.query('INSERT INTO outlets(id,tenant_id,slug,name) VALUES($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)',[ids.outletA,ids.tenantA,'outlet-a','Outlet A',ids.outletOtherA,ids.tenantA,'outlet-a2','Outlet A2',ids.outletB,ids.tenantB,'outlet-b','Outlet B']);
  await admin.query('INSERT INTO dining_tables(id,tenant_id,outlet_id,table_code,display_name,capacity) VALUES($1,$2,$3,$4,$5,2),($6,$7,$8,$9,$10,2)',[ids.tableA,ids.tenantA,ids.outletA,'A-1','Table A',ids.tableB,ids.tenantB,ids.outletB,'B-1','Table B']);
  await admin.query('INSERT INTO staff_accounts(id,email,display_name,pin_hash) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',[ids.staffA,`a-${slug}@test.invalid`,'Staff A','scrypt$00$00',ids.staffB,`b-${slug}@test.invalid`,'Staff B','scrypt$00$00']);
  const ms = await admin.query("INSERT INTO tenant_memberships(tenant_id,staff_id,role_code) VALUES($1,$2,'owner'),($3,$4,'owner') RETURNING id,tenant_id",[ids.tenantA,ids.staffA,ids.tenantB,ids.staffB]);
  const ma = ms.rows.find(x=>x.tenant_id===ids.tenantA);
  await admin.query("INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code) VALUES($1,$2,$3,'owner')",[ids.tenantA,ids.outletA,ma.id]);
  await admin.query("INSERT INTO staff_sessions(id,staff_id,tenant_id,outlet_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",[ids.staffSessionA,ids.staffA,ids.tenantA,ids.outletA,`token-${slug}`]);
  await admin.query('COMMIT');

  phase('verify deny-by-default without tenant context');
  await runtime.connect(); await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  for (const table of ['tenants','outlets','tenant_memberships','outlet_memberships','staff_accounts','staff_sessions','dining_tables']) {
    const result = await runtime.query(`SELECT * FROM ${table}`);
    if (result.rowCount !== 0) throw new Error(`No-context query leaked ${table}`);
  }
  await runtime.query('ROLLBACK');

  phase('verify explicit pre-auth lookup and token-scoped session access');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await runtime.query("SELECT set_config('app.auth_lookup','true',true)");
  const candidates = await runtime.query('SELECT id FROM staff_accounts');
  if (candidates.rowCount !== 2) throw new Error('PIN/NFC auth lookup did not see expected credential candidates');
  if ((await runtime.query('SELECT id FROM staff_sessions')).rowCount !== 0) throw new Error('Auth lookup exposed sessions');
  await runtime.query('ROLLBACK');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await runtime.query("SELECT set_config('app.session_token_hash',$1,true)",[ `token-${slug}` ]);
  const session = await runtime.query('SELECT id FROM staff_sessions');
  if (session.rowCount !== 1 || session.rows[0].id !== ids.staffSessionA) throw new Error('Session token policy did not isolate a single session');
  await runtime.query('ROLLBACK');

  phase('verify tenant/outlet isolation including security-invoker view');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await runtime.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[ids.tenantA,ids.outletA]);
  const tables = await runtime.query('SELECT id FROM dining_tables');
  if (tables.rowCount !== 1 || tables.rows[0].id !== ids.tableA) throw new Error('Tenant/outlet table read isolation failed');
  const board = await runtime.query('SELECT table_id FROM v_table_board');
  if (board.rowCount !== 1 || board.rows[0].table_id !== ids.tableA) throw new Error('Table-board view leaked rows');
  const staff = await runtime.query('SELECT id FROM staff_accounts');
  if (staff.rowCount !== 1 || staff.rows[0].id !== ids.staffA) throw new Error('Staff account tenant scope failed');
  if ((await runtime.query('SELECT id FROM tenant_memberships')).rowCount !== 1) throw new Error('Tenant membership scope failed');
  await runtime.query('ROLLBACK');

  phase('verify cross-tenant and cross-outlet write rejection');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await runtime.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[ids.tenantA,ids.outletA]);
  await assertDenied(runtime,'INSERT INTO dining_tables(tenant_id,outlet_id,table_code,display_name,capacity) VALUES($1,$2,$3,$4,2)',[ids.tenantB,ids.outletB,`bad-t-${slug}`,'Bad tenant'],'Cross-tenant insert');
  await assertDenied(runtime,'INSERT INTO dining_tables(tenant_id,outlet_id,table_code,display_name,capacity) VALUES($1,$2,$3,$4,2)',[ids.tenantA,ids.outletOtherA,`bad-o-${slug}`,'Bad outlet'],'Cross-outlet insert');
  await runtime.query('ROLLBACK');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await runtime.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[ids.tenantA,ids.outletOtherA]);
  if ((await runtime.query('SELECT id FROM dining_tables')).rowCount !== 0) throw new Error('Wrong outlet context exposed rows');
  await runtime.query('ROLLBACK');

  phase('verify concurrent open-session uniqueness');
  await contender.connect();
  await admin.query('BEGIN');
  await admin.query("INSERT INTO dining_sessions(id,tenant_id,outlet_id,table_id,session_number,guest_count,status) VALUES($1,$2,$3,$4,$5,2,'active')",[ids.diningSessionA,ids.tenantA,ids.outletA,ids.tableA,`SA-${slug}`]);
  await contender.query('BEGIN');
  const competing = contender.query("INSERT INTO dining_sessions(id,tenant_id,outlet_id,table_id,session_number,guest_count,status) VALUES($1,$2,$3,$4,$5,2,'active')",[ids.diningSessionB,ids.tenantA,ids.outletA,ids.tableA,`SB-${slug}`]);
  await new Promise(resolve=>setTimeout(resolve,150));
  await admin.query('COMMIT');
  let duplicateSessionDenied=false;
  try { await competing; await contender.query('COMMIT'); } catch(error) { duplicateSessionDenied=error.code==='23505'; await contender.query('ROLLBACK').catch(()=>{}); }
  if(!duplicateSessionDenied) throw new Error('Concurrent second open session was not rejected');
  phase('verify idempotency-key uniqueness');
  await admin.query('INSERT INTO idempotency_keys(tenant_id,outlet_id,key,operation) VALUES($1,$2,$3,$4)',[ids.tenantA,ids.outletA,`idem-${slug}`,'safety-test']);
  let duplicateKeyDenied=false;
  try { await admin.query('INSERT INTO idempotency_keys(tenant_id,outlet_id,key,operation) VALUES($1,$2,$3,$4)',[ids.tenantA,ids.outletA,`idem-${slug}`,'safety-test']); } catch(error) { duplicateKeyDenied=error.code==='23505'; }
  if(!duplicateKeyDenied) throw new Error('Duplicate idempotency key was accepted');

  phase('all RLS assertions passed');
  console.log(JSON.stringify({tests:'passed',rls:{allTablesForceRls:true,noContextDenied:true,explicitAuthLookup:true,tokenScopedSessions:true,tenantIsolation:true,outletIsolation:true,crossTenantWriteDenied:true,crossOutletWriteDenied:true,viewSecurityInvoker:true,staffScope:true}, concurrency:{oneOpenSessionPerTable:duplicateSessionDenied}, idempotency:{duplicateKeyRejected:duplicateKeyDenied}},null,2));
} finally {
  await runtime.query('ROLLBACK').catch(()=>{});
  await admin.query('DELETE FROM idempotency_keys WHERE tenant_id=$1 AND outlet_id=$2',[ids.tenantA,ids.outletA]).catch(()=>{});
  await admin.query('DELETE FROM dining_sessions WHERE id=ANY($1::uuid[])',[[ids.diningSessionA,ids.diningSessionB]]).catch(()=>{});
  await admin.query('DELETE FROM staff_sessions WHERE id=$1',[ids.staffSessionA]).catch(()=>{});
  await admin.query('DELETE FROM outlet_memberships WHERE tenant_id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB]]).catch(()=>{});
  await admin.query('DELETE FROM tenant_memberships WHERE tenant_id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB]]).catch(()=>{});
  await admin.query('DELETE FROM staff_accounts WHERE id=ANY($1::uuid[])',[[ids.staffA,ids.staffB]]).catch(()=>{});
  await admin.query('DELETE FROM dining_tables WHERE tenant_id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB]]).catch(()=>{});
  await admin.query('DELETE FROM outlets WHERE tenant_id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB]]).catch(()=>{});
  await admin.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB]]).catch(()=>{});
  await Promise.all([runtime.end().catch(()=>{}),contender.end().catch(()=>{}),admin.end().catch(()=>{})]);
}