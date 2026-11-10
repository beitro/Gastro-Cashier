import pg from 'pg';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
if (process.env.DB_SAFETY_ALLOW_MUTATIONS !== 'YES') throw new Error('Refusing fixture writes: set DB_SAFETY_ALLOW_MUTATIONS=YES only for a disposable CI database.');
const opts = { connectionString, connectionTimeoutMillis: 10000, statement_timeout: 15000, query_timeout: 20000 };
const admin = new Client(opts), runtime = new Client(opts), contender = new Client(opts);
const phase = name => console.log(`[db-safety] ${name}`);
const ids = { tenantA:randomUUID(), tenantB:randomUUID(), outletA:randomUUID(), outletOtherA:randomUUID(), outletB:randomUUID(), bootstrapTenant:randomUUID(), bootstrapOutlet:randomUUID(), bootstrapStaff:randomUUID(), tableA:randomUUID(), tableOtherA:randomUUID(), tableB:randomUUID(), staffA:randomUUID(), staffB:randomUUID(), staffCreated:randomUUID(), staffSessionA:randomUUID(), diningSessionA:randomUUID(), diningSessionB:randomUUID() };
const contextSecret = randomBytes(32);
function signedContext(claims) {
  const now = Math.floor(Date.now() / 1000);
  const payloadBytes=Buffer.from(JSON.stringify({v:'1',iat:now,exp:now+60,jti:randomUUID(),...claims}));
  const payload=payloadBytes.toString('base64url');
  return payload + '.' + createHmac('sha256',contextSecret).update(payloadBytes).digest('base64url');
}
async function applyContext(client, claims) {
  const tx=await client.query('SELECT txid_current()::text AS txid');
  await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[claims.tenant_id || '',claims.outlet_id || '']);
  await client.query("SELECT set_config('app.context_token',$1,true)",[signedContext({...claims,txid:tx.rows[0].txid})]);
}
const slug = randomUUID().replaceAll('-','').slice(0,16);
let createdTestRole = false;
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
  const testRoleExists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname='gastro_runtime_test'");
  createdTestRole = testRoleExists.rowCount === 0;
  if (createdTestRole) await admin.query('CREATE ROLE gastro_runtime_test NOLOGIN NOSUPERUSER NOBYPASSRLS');
  await admin.query('ALTER ROLE gastro_runtime_test NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION');
  await admin.query('GRANT USAGE ON SCHEMA public TO gastro_runtime_test');
  await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO gastro_runtime_test');
  await admin.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO gastro_runtime_test');
  const role = await admin.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='gastro_runtime_test'");
  if (role.rows[0].rolsuper || role.rows[0].rolbypassrls) throw new Error('Runtime role can bypass RLS');
  const tableAudit = await admin.query("SELECT count(*)::int AS total,count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity)::int AS protected FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')");
  if (tableAudit.rows[0].total !== tableAudit.rows[0].protected) throw new Error(`Not every public table FORCE RLS (${tableAudit.rows[0].protected}/${tableAudit.rows[0].total})`);
  const view = await admin.query("SELECT reloptions FROM pg_class WHERE oid='public.v_table_board'::regclass");
  if (!view.rows[0]?.reloptions?.includes('security_invoker=true')) throw new Error('v_table_board is not security_invoker');

  phase('provision ephemeral test signing key');
  await admin.query(
    `INSERT INTO app_private.rls_context_keys(singleton,secret,updated_at)
     VALUES(TRUE,$1,now())
     ON CONFLICT(singleton) DO UPDATE SET secret=EXCLUDED.secret,updated_at=now()`,
    [contextSecret]
  );

  phase('seed isolated tenant, outlet, staff and session fixtures');
  await admin.query('BEGIN');
  await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3),($4,$5,$6)',[ids.tenantA,`rls-a-${slug}`,'Tenant A',ids.tenantB,`rls-b-${slug}`,'Tenant B']);
  await admin.query('INSERT INTO outlets(id,tenant_id,slug,name) VALUES($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)',[ids.outletA,ids.tenantA,'outlet-a','Outlet A',ids.outletOtherA,ids.tenantA,'outlet-a2','Outlet A2',ids.outletB,ids.tenantB,'outlet-b','Outlet B']);
  await admin.query('INSERT INTO dining_tables(id,tenant_id,outlet_id,table_code,display_name,capacity) VALUES($1,$2,$3,$4,$5,2),($6,$7,$8,$9,$10,2),($11,$12,$13,$14,$15,2)',[ids.tableA,ids.tenantA,ids.outletA,'A-1','Table A',ids.tableB,ids.tenantB,ids.outletB,'B-1','Table B',ids.tableOtherA,ids.tenantA,ids.outletOtherA,'A2-1','Table A2']);
  await admin.query('INSERT INTO staff_accounts(id,email,display_name,pin_hash) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',[ids.staffA,`a-${slug}@test.invalid`,'Staff A','scrypt$00$00',ids.staffB,`b-${slug}@test.invalid`,'Staff B','scrypt$00$00']);
  const ms = await admin.query("INSERT INTO tenant_memberships(tenant_id,staff_id,role_code) VALUES($1,$2,'owner'),($3,$4,'owner') RETURNING id,tenant_id",[ids.tenantA,ids.staffA,ids.tenantB,ids.staffB]);
  const ma = ms.rows.find(x=>x.tenant_id===ids.tenantA);
  await admin.query("INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code) VALUES($1,$2,$3,'owner')",[ids.tenantA,ids.outletA,ma.id]);
  await admin.query("INSERT INTO staff_sessions(id,staff_id,tenant_id,outlet_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",[ids.staffSessionA,ids.staffA,ids.tenantA,ids.outletA,`token-${slug}`]);
  await admin.query('COMMIT');

  await runtime.connect();
  phase('verify signed one-time bootstrap capability and tenant-scoped follow-up');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{capabilities:['bootstrap']});
  await runtime.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3)',[ids.bootstrapTenant,`boot-${slug}`,'Bootstrap test tenant']);
  await runtime.query('INSERT INTO outlets(id,tenant_id,slug,name) VALUES($1,$2,$3,$4)',[ids.bootstrapOutlet,ids.bootstrapTenant,'main','Bootstrap test outlet']);
  await applyContext(runtime,{tenant_id:ids.bootstrapTenant,outlet_id:ids.bootstrapOutlet,capabilities:['bootstrap','tenant_scope']});
  await runtime.query('INSERT INTO tenant_settings(tenant_id) VALUES($1)',[ids.bootstrapTenant]);
  await runtime.query('INSERT INTO staff_accounts(id,email,display_name,pin_hash) VALUES($1,$2,$3,$4)',[ids.bootstrapStaff,`bootstrap-${slug}@test.invalid`,'Bootstrap owner','scrypt$00$00']);
  const bootstrapMembership=(await runtime.query("INSERT INTO tenant_memberships(tenant_id,staff_id,role_code) VALUES($1,$2,'owner') RETURNING id",[ids.bootstrapTenant,ids.bootstrapStaff])).rows[0];
  await runtime.query("INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code) VALUES($1,$2,$3,'owner')",[ids.bootstrapTenant,ids.bootstrapOutlet,bootstrapMembership.id]);
  await runtime.query('ROLLBACK');

  phase('verify caller-set legacy GUCs cannot forge capabilities');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await runtime.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[ids.tenantB,ids.outletB]);
  await runtime.query("SELECT set_config('app.auth_lookup','true',true),set_config('app.bootstrap_mode','true',true),set_config('app.staff_admin','true',true),set_config('app.actor_staff_id',$1,true),set_config('app.session_token_hash',$2,true),set_config('app.auth_rate_limit','true',true)",[ids.staffB,`token-${slug}`]);
  for (const table of ['tenants','outlets','tenant_memberships','outlet_memberships','staff_accounts','staff_sessions','dining_tables','auth_rate_limits']) {
    const result = await runtime.query(`SELECT * FROM ${table}`);
    if (result.rowCount !== 0) throw new Error(`Legacy GUC forgery leaked ${table}`);
  }
  await assertDenied(runtime,'INSERT INTO auth_rate_limits(scope_hash,failed_attempts) VALUES($1,1)',['b'.repeat(64)],'Forged auth rate-limit capability');
  await assertDenied(runtime,'INSERT INTO tenants(slug,name) VALUES($1,$2)',[`forged-${slug}`,'Forged tenant'],'Forged bootstrap capability');
  await assertDenied(runtime,'INSERT INTO staff_accounts(email,display_name,pin_hash) VALUES($1,$2,$3)',[`forged-${slug}@test.invalid`,'Forged staff','scrypt$00$00'],'Forged staff-admin capability');
  await runtime.query('ROLLBACK');

  phase('verify deny-by-default without tenant context');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  for (const table of ['tenants','outlets','tenant_memberships','outlet_memberships','staff_accounts','staff_sessions','dining_tables','auth_rate_limits']) {
    const result = await runtime.query(`SELECT * FROM ${table}`);
    if (result.rowCount !== 0) throw new Error(`No-context query leaked ${table}`);
  }
  await runtime.query('ROLLBACK');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{capabilities:['auth_rate_limit']});
  await runtime.query('INSERT INTO auth_rate_limits(scope_hash,failed_attempts) VALUES($1,1)',[ 'a'.repeat(64) ]);
  if ((await runtime.query('SELECT failed_attempts FROM auth_rate_limits WHERE scope_hash=$1',[ 'a'.repeat(64) ])).rowCount !== 1) throw new Error('Auth rate-limit context could not access its own ledger');
  await runtime.query('ROLLBACK');

  phase('verify explicit pre-auth lookup and token-scoped session access');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{capabilities:['auth_lookup']});
  const candidates = await runtime.query('SELECT id FROM staff_accounts');
  if (candidates.rowCount !== 2) throw new Error('PIN/NFC auth lookup did not see expected credential candidates');
  if ((await runtime.query('SELECT id FROM staff_sessions')).rowCount !== 0) throw new Error('Auth lookup exposed sessions');
  await runtime.query('ROLLBACK');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{capabilities:['session_lookup'],session_token_hash:`token-${slug}`});
  const session = await runtime.query('SELECT id FROM staff_sessions');
  if (session.rowCount !== 1 || session.rows[0].id !== ids.staffSessionA) throw new Error('Session token policy did not isolate a single session');
  await runtime.query('ROLLBACK');

  phase('verify tenant context alone cannot enumerate staff sessions');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,capabilities:['tenant_scope']});
  if ((await runtime.query('SELECT id FROM staff_sessions')).rowCount !== 0) throw new Error('Tenant context alone exposed staff sessions');
  await runtime.query('ROLLBACK');

  phase('verify signed context cannot be replayed or tampered across transactions');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,capabilities:['tenant_scope']});
  const capturedToken=(await runtime.query("SELECT current_setting('app.context_token') AS token")).rows[0].token;
  if((await runtime.query('SELECT id FROM dining_tables')).rowCount!==1) throw new Error('Fresh signed context was not accepted.');
  await runtime.query('COMMIT');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await runtime.query("SELECT set_config('app.context_token',$1,true)",[capturedToken]);
  if((await runtime.query('SELECT id FROM dining_tables')).rowCount!==0) throw new Error('A signed context token was replayed in a different transaction.');
  await runtime.query('ROLLBACK');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await runtime.query("SELECT set_config('app.context_token',$1,true)",[capturedToken+'tampered']);
  if((await runtime.query('SELECT id FROM dining_tables')).rowCount!==0) throw new Error('A tampered signed context token was accepted.');
  await runtime.query('ROLLBACK');

  phase('verify tenant/outlet isolation including security-invoker view');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,capabilities:['tenant_scope']});
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
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,capabilities:['tenant_scope']});
  await assertDenied(runtime,'INSERT INTO dining_tables(tenant_id,outlet_id,table_code,display_name,capacity) VALUES($1,$2,$3,$4,2)',[ids.tenantB,ids.outletB,`bad-t-${slug}`,'Bad tenant'],'Cross-tenant insert');
  await assertDenied(runtime,'INSERT INTO dining_tables(tenant_id,outlet_id,table_code,display_name,capacity) VALUES($1,$2,$3,$4,2)',[ids.tenantA,ids.outletOtherA,`bad-o-${slug}`,'Bad outlet'],'Cross-outlet insert');
  await runtime.query('ROLLBACK');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletOtherA,capabilities:['tenant_scope']});
  const outletScopedRows=await runtime.query('SELECT id FROM dining_tables');
  if (outletScopedRows.rowCount !== 1 || outletScopedRows.rows[0].id !== ids.tableOtherA) throw new Error('Wrong outlet context exposed rows outside its own outlet');
  await runtime.query('ROLLBACK');

  phase('verify the provisioned gastro_runtime role with production grants');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime');
  const currentRole=await runtime.query('SELECT current_user,rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user');
  if(currentRole.rows[0].current_user!=='gastro_runtime'||currentRole.rows[0].rolsuper||currentRole.rows[0].rolbypassrls||currentRole.rows[0].rolinherit) throw new Error('Provisioned runtime role attributes are unsafe');
  const keyAccess=await runtime.query("SELECT has_table_privilege(current_user,'app_private.rls_context_keys','SELECT') AS can_read_key");
  if(keyAccess.rows[0].can_read_key) throw new Error('Runtime role can read the private RLS signing key table.');
  if((await runtime.query('SELECT id FROM staff_accounts')).rowCount!==0 || (await runtime.query('SELECT id FROM staff_sessions')).rowCount!==0) throw new Error('Production runtime role leaked pre-auth data without context');
  await applyContext(runtime,{capabilities:['auth_lookup']});
  if((await runtime.query('SELECT id FROM staff_accounts')).rowCount!==2) throw new Error('Production runtime role cannot perform explicit PIN/NFC lookup');
  if((await runtime.query('SELECT id FROM staff_sessions')).rowCount!==0) throw new Error('Auth lookup exposed production sessions');
  await applyContext(runtime,{capabilities:['session_lookup'],session_token_hash:`token-${slug}`});
  if((await runtime.query('SELECT id FROM staff_sessions')).rowCount!==1) throw new Error('Production runtime token lookup failed');
  await assertDenied(runtime,'UPDATE staff_sessions SET staff_id=$1 WHERE token_hash=$2',[ids.staffB,`token-${slug}`],'Runtime session identity mutation');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,session_token_hash:`token-${slug}`,capabilities:['tenant_scope','session_revoke_self']});
  await runtime.query('UPDATE staff_sessions SET revoked_at=now() WHERE token_hash=$1',[`token-${slug}`]);
  if((await runtime.query('SELECT id FROM staff_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',[`token-${slug}`])).rowCount!==0) throw new Error('Revoked session remained active');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,capabilities:['tenant_scope']});
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,capabilities:['tenant_scope']});
  if((await runtime.query('SELECT id FROM staff_sessions')).rowCount!==0) throw new Error('Tenant/outlet context alone enumerated production sessions');
  if((await runtime.query('SELECT table_id FROM v_table_board')).rowCount!==1) throw new Error('Production runtime role cannot read the secured table-board view');
  if((await runtime.query('SELECT id FROM staff_accounts')).rowCount!==1) throw new Error('Production runtime staff tenant isolation failed');
  await assertDenied(runtime,"INSERT INTO dining_sessions(tenant_id,outlet_id,table_id,session_number,guest_count,status) VALUES($1,$2,$3,$4,2,'active')",[ids.tenantB,ids.outletB,ids.tableB,`bad-runtime-tenant-${slug}`],'Production runtime cross-tenant write');
  await assertDenied(runtime,"INSERT INTO dining_sessions(tenant_id,outlet_id,table_id,session_number,guest_count,status) VALUES($1,$2,$3,$4,2,'active')",[ids.tenantA,ids.outletOtherA,ids.tableOtherA,`bad-runtime-outlet-${slug}`],'Production runtime cross-outlet write');
  await runtime.query('ROLLBACK');

  phase('verify signed Owner capability and reject signed non-Owner staff administration');
  // Exercise signed Owner RLS policy with the broad-grant test role; production gastro_runtime is separately tested as read-only.
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,actor_staff_id:ids.staffA,role_code:'cashier',pending_staff_id:ids.staffCreated,capabilities:['tenant_scope','staff_admin']});
  await assertDenied(runtime,'INSERT INTO staff_accounts(id,email,display_name,pin_hash) VALUES($1,$2,$3,$4)',[ids.staffCreated,`cashier-forged-${slug}@test.invalid`,'Forged Admin','scrypt$00$00'],'Signed non-Owner staff creation');
  await runtime.query('ROLLBACK');
  await runtime.query('BEGIN'); await runtime.query('SET LOCAL ROLE gastro_runtime_test');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,actor_staff_id:ids.staffA,role_code:'owner',pending_staff_id:ids.staffCreated,capabilities:['tenant_scope','staff_admin']});
  const verifiedClaims=(await runtime.query("SELECT app_private.rls_context() AS claims")).rows[0].claims;
  if(!verifiedClaims || verifiedClaims.role_code!=='owner' || verifiedClaims.actor_staff_id!==ids.staffA || !verifiedClaims.capabilities.includes('staff_admin')) throw new Error('Signed Owner context claims were not verified correctly: '+JSON.stringify(verifiedClaims));
  const visibleOwner=(await runtime.query("SELECT count(*)::int AS n FROM tenant_memberships WHERE tenant_id=$1 AND staff_id=$2 AND role_code='owner' AND status='active'",[ids.tenantA,ids.staffA])).rows[0].n;
  if(visibleOwner!==1) throw new Error('Signed Owner context cannot see the active owner membership required by admin RLS policy.');
  const adminGate=(await runtime.query(`SELECT
    app_private.rls_context()->'capabilities' ? 'staff_admin' AS has_admin_cap,
    app_private.rls_context()->>'role_code' AS role_code,
    EXISTS(SELECT 1 FROM tenant_memberships actor_tm WHERE actor_tm.staff_id=$1 AND actor_tm.tenant_id=$2 AND actor_tm.role_code='owner' AND actor_tm.status='active') AS owner_exists`,[ids.staffA,ids.tenantA])).rows[0];
  if(!adminGate.has_admin_cap || adminGate.role_code!=='owner' || !adminGate.owner_exists) throw new Error('Signed Owner RLS gate false: '+JSON.stringify(adminGate));
  phase('verify staff-admin target membership isolation and tenant GUC binding');
  const staffVisibleA=await runtime.query('SELECT id FROM staff_accounts ORDER BY id');
  if(staffVisibleA.rowCount!==1 || staffVisibleA.rows[0].id!==ids.staffA) throw new Error('Tenant A admin SELECT exposed staff outside tenant A.');
  const crossUpdateA=await runtime.query('UPDATE staff_accounts SET display_name=$1 WHERE id=$2 RETURNING id',['Cross-tenant mutation A to B',ids.staffB]);
  if(crossUpdateA.rowCount!==0) throw new Error('Tenant A admin updated staff belonging only to tenant B.');
  await applyContext(runtime,{tenant_id:ids.tenantB,outlet_id:ids.outletB,actor_staff_id:ids.staffB,role_code:'owner',capabilities:['tenant_scope','staff_admin']});
  const staffVisibleB=await runtime.query('SELECT id FROM staff_accounts ORDER BY id');
  if(staffVisibleB.rowCount!==1 || staffVisibleB.rows[0].id!==ids.staffB) throw new Error('Tenant B admin SELECT exposed staff outside tenant B.');
  const crossUpdateB=await runtime.query('UPDATE staff_accounts SET display_name=$1 WHERE id=$2 RETURNING id',['Cross-tenant mutation B to A',ids.staffA]);
  if(crossUpdateB.rowCount!==0) throw new Error('Tenant B admin updated staff belonging only to tenant A.');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,actor_staff_id:ids.staffA,role_code:'owner',pending_staff_id:ids.staffCreated,capabilities:['tenant_scope','staff_admin']});
  await runtime.query("SELECT set_config('app.tenant_id','',true)");
  if((await runtime.query('SELECT id FROM staff_accounts')).rowCount!==0) throw new Error('Valid signed context without app.tenant_id exposed staff rows.');
  await runtime.query("SELECT set_config('app.tenant_id',$1,true)",[ids.tenantB]);
  if((await runtime.query('SELECT id FROM staff_accounts')).rowCount!==0) throw new Error('Mismatched app.tenant_id bypassed signed tenant scope.');
  await applyContext(runtime,{tenant_id:ids.tenantA,outlet_id:ids.outletA,actor_staff_id:ids.staffA,role_code:'owner',pending_staff_id:ids.staffCreated,capabilities:['tenant_scope','staff_admin']});
  await assertDenied(runtime,'UPDATE tenant_memberships SET tenant_id=$1 WHERE tenant_id=$2 AND staff_id=$3',[ids.tenantB,ids.tenantA,ids.staffA],'Changing staff tenant membership through admin UPDATE');
  const createdStaff=(await runtime.query('INSERT INTO staff_accounts(id,email,display_name,pin_hash) VALUES($1,$2,$3,$4) RETURNING id',[ids.staffCreated,`owner-created-${slug}@test.invalid`,'Owner-created staff','scrypt$00$00'])).rows[0];
  const createdMembership=(await runtime.query("INSERT INTO tenant_memberships(tenant_id,staff_id,role_code) VALUES($1,$2,'cashier') RETURNING id",[ids.tenantA,ids.staffCreated])).rows[0];
  await runtime.query("INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code) VALUES($1,$2,$3,'cashier')",[ids.tenantA,ids.outletA,createdMembership.id]);
  await runtime.query("UPDATE tenant_memberships SET role_code='finance' WHERE id=$1",[createdMembership.id]);
  await runtime.query("UPDATE outlet_memberships SET role_code='finance' WHERE tenant_membership_id=$1 AND outlet_id=$2",[createdMembership.id,ids.outletA]);
  await runtime.query("UPDATE staff_accounts SET phone=$1 WHERE id=$2",['+6281234567890',ids.staffCreated]);
  await runtime.query('UPDATE staff_sessions SET revoked_at=now() WHERE id=$1',[ids.staffSessionA]);
  await runtime.query('INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,$6)',[ids.tenantA,ids.outletA,ids.staffA,'staff.created','staff',ids.staffCreated]);
  if((await runtime.query('SELECT id FROM staff_accounts WHERE id=$1',[ids.staffCreated])).rowCount!==1) throw new Error('Signed Owner could not create staff.');
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
  await admin.query('ROLLBACK').catch(()=>{});
  await admin.query('DELETE FROM idempotency_keys WHERE tenant_id=$1 AND outlet_id=$2',[ids.tenantA,ids.outletA]).catch(()=>{});
  await admin.query('DELETE FROM dining_sessions WHERE id=ANY($1::uuid[])',[[ids.diningSessionA,ids.diningSessionB]]).catch(()=>{});
  await admin.query('DELETE FROM staff_sessions WHERE id=$1',[ids.staffSessionA]).catch(()=>{});
  await admin.query('DELETE FROM outlet_memberships WHERE tenant_id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB,ids.bootstrapTenant]]).catch(()=>{});
  await admin.query('DELETE FROM tenant_memberships WHERE tenant_id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB,ids.bootstrapTenant]]).catch(()=>{});
  await admin.query('DELETE FROM staff_accounts WHERE id=ANY($1::uuid[])',[[ids.staffA,ids.staffB,ids.staffCreated,ids.bootstrapStaff]]).catch(()=>{});
  await admin.query('DELETE FROM dining_tables WHERE tenant_id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB]]).catch(()=>{});
  await admin.query('DELETE FROM tenant_settings WHERE tenant_id=$1',[ids.bootstrapTenant]).catch(()=>{});
  await admin.query('DELETE FROM outlets WHERE tenant_id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB,ids.bootstrapTenant]]).catch(()=>{});
  await admin.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[[ids.tenantA,ids.tenantB,ids.bootstrapTenant]]).catch(()=>{});
  if (createdTestRole) {
    await admin.query('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM gastro_runtime_test').catch(()=>{});
    await admin.query('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM gastro_runtime_test').catch(()=>{});
    await admin.query('REVOKE USAGE ON SCHEMA public FROM gastro_runtime_test').catch(()=>{});
    await admin.query('DROP ROLE IF EXISTS gastro_runtime_test').catch(()=>{});
  }
  await Promise.all([runtime.end().catch(()=>{}),contender.end().catch(()=>{}),admin.end().catch(()=>{})]);
}