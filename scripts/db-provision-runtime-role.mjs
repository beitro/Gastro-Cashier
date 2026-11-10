import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const password = process.env.RUNTIME_DB_PASSWORD;
const roleName = process.env.RUNTIME_DB_ROLE || 'gastro_runtime';
if (!adminUrl || !password || password.length < 24) throw new Error('ADMIN_DATABASE_URL and RUNTIME_DB_PASSWORD (at least 24 characters) are required.');
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(roleName)) throw new Error('RUNTIME_DB_ROLE must be a simple PostgreSQL identifier.');
const ident = value => '"' + String(value).replaceAll('"','""') + '"';
const literal = value => "'" + String(value).replaceAll("'","''") + "'";
const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query('BEGIN');
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[roleName]);
  if (!exists.rowCount) await client.query(`CREATE ROLE ${ident(roleName)} LOGIN`);
  await client.query(`ALTER ROLE ${ident(roleName)} WITH LOGIN PASSWORD ${literal(password)}`);
  const db = (await client.query('SELECT current_database() AS name')).rows[0].name;
  // Remove stale direct grants before applying the allowlist. Re-granting alone is not least privilege.
  for (const sql of [
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${ident(roleName)}`,
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${ident(roleName)}`,
    `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${ident(roleName)}`,
    `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${ident(roleName)}`
  ]) await client.query(sql);
  const grants = [
    `GRANT CONNECT ON DATABASE ${ident(db)} TO ${ident(roleName)}`,
    `GRANT USAGE ON SCHEMA public, app_private TO ${ident(roleName)}`,
    `GRANT EXECUTE ON FUNCTION app_private.rls_context() TO ${ident(roleName)}`,
    `GRANT SELECT ON tenants,outlets,tenant_memberships,outlet_memberships,tenant_settings,outlet_settings,menu_categories,menu_items,dining_tables,dining_sessions,order_batches,order_items,payments,v_table_board,staff_sessions TO ${ident(roleName)}`,
    `GRANT SELECT (id,display_name,email,phone,status,pin_hash,nfc_credential_hash) ON staff_accounts TO ${ident(roleName)}`,
    `GRANT INSERT (email,phone,display_name,pin_hash,nfc_credential_hash) ON staff_accounts TO ${ident(roleName)}`,
    `GRANT UPDATE (email,phone,display_name,status,pin_hash,nfc_credential_hash) ON staff_accounts TO ${ident(roleName)}`,
    `GRANT INSERT ON tenant_memberships,outlet_memberships TO ${ident(roleName)}`,
    `GRANT UPDATE (role_code,status) ON tenant_memberships,outlet_memberships TO ${ident(roleName)}`,
    `GRANT INSERT ON dining_sessions,order_batches,order_items,payments,payment_allocations,staff_sessions,audit_logs TO ${ident(roleName)}`,
    `GRANT UPDATE ON dining_sessions,order_items,auth_rate_limits TO ${ident(roleName)}`,
    `GRANT UPDATE (revoked_at) ON staff_sessions TO ${ident(roleName)}`,
    `GRANT INSERT ON auth_rate_limits TO ${ident(roleName)}`,
    `GRANT SELECT ON auth_rate_limits TO ${ident(roleName)}`
  ];
  for (const sql of grants) await client.query(sql);
  const result=await client.query('SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname=$1',[roleName]);
  const role=result.rows[0];
  const ownership=await client.query("SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS owns_objects, EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS owns_schema, EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS has_memberships, has_schema_privilege($1,'public','CREATE') AS can_create_schema_objects, has_database_privilege($1,current_database(),'CREATE') AS can_create_schemas",[roleName]);
  if (!role || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolreplication || ownership.rows[0].owns_objects || ownership.rows[0].owns_schema || ownership.rows[0].has_memberships || ownership.rows[0].can_create_schema_objects || ownership.rows[0].can_create_schemas) throw new Error('Runtime role must be non-owner, NOSUPERUSER, NOBYPASSRLS and have no role memberships; Neon-managed INHERIT is acceptable only when membership-free.');
  await client.query('COMMIT');
  console.log(JSON.stringify({provisioned:true,role:role.rolname,superuser:role.rolsuper,bypassRls:role.rolbypassrls,inherit:role.rolinherit},null,2));
} catch (error) {
  await client.query('ROLLBACK').catch(()=>{});
  throw error;
} finally { await client.end().catch(()=>{}); }