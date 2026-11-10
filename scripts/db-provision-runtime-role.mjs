import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const roleName = process.env.RUNTIME_DB_ROLE || 'gastro_runtime';
if (!adminUrl) throw new Error('ADMIN_DATABASE_URL is required. Provision the login role and rotate its password through the Neon role API, not SQL.');
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(roleName)) throw new Error('RUNTIME_DB_ROLE must be a simple PostgreSQL identifier.');
const ident = value => '"' + String(value).replaceAll('"','""') + '"';
const literal = value => "'" + String(value).replaceAll("'","''") + "'";
const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query('BEGIN');
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication',[roleName]);
  if (!exists.rowCount) throw new Error('Create gastro_runtime as a Neon read_only role first; it must be LOGIN, non-superuser, non-BYPASSRLS and non-privileged.');
  const db = (await client.query('SELECT current_database() AS name')).rows[0].name;
  // Remove stale direct grants before applying the allowlist. Re-granting alone is not least privilege.
  for (const sql of [
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${ident(roleName)}`,
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${ident(roleName)}`,
    `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${ident(roleName)}`,
    `REVOKE INSERT (id,email,phone,display_name,pin_hash) ON staff_accounts FROM ${ident(roleName)}`,
    `REVOKE INSERT (tenant_id,staff_id,role_code) ON tenant_memberships FROM ${ident(roleName)}`,
    `REVOKE INSERT (tenant_id,outlet_id,tenant_membership_id,role_code) ON outlet_memberships FROM ${ident(roleName)}`,
    `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${ident(roleName)}`
  ]) await client.query(sql);
  const grants = [
    `GRANT CONNECT ON DATABASE ${ident(db)} TO ${ident(roleName)}`,
    `GRANT USAGE ON SCHEMA public TO ${ident(roleName)}`,
    `GRANT SELECT ON tenants,outlets,tenant_memberships,outlet_memberships,tenant_settings,outlet_settings,menu_categories,menu_items,dining_tables,dining_sessions,order_batches,order_items,payments,v_table_board,staff_sessions TO ${ident(roleName)}`,
    `GRANT SELECT (id,display_name,email,phone,status,pin_hash,nfc_credential_hash,created_at) ON staff_accounts TO ${ident(roleName)}`,
    // Create-staff only: owner-only signed RLS policies guard these column-limited INSERTs.
    `GRANT INSERT (id,email,phone,display_name,pin_hash) ON staff_accounts TO ${ident(roleName)}`,
    `GRANT INSERT (tenant_id,staff_id,role_code) ON tenant_memberships TO ${ident(roleName)}`,
    `GRANT INSERT (tenant_id,outlet_id,tenant_membership_id,role_code) ON outlet_memberships TO ${ident(roleName)}`,
    // No UPDATE on staff_accounts or membership tables; status/role/credential mutations stay disabled.
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
  if (!role || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolreplication || ownership.rows[0].owns_objects || ownership.rows[0].owns_schema || ownership.rows[0].has_memberships || ownership.rows[0].can_create_schema_objects || ownership.rows[0].can_create_schemas) throw new Error('Runtime role must be non-owner, NOSUPERUSER, NOBYPASSRLS, non-privileged and have no role memberships.');
  await client.query('COMMIT');
  console.log(JSON.stringify({provisioned:true,role:role.rolname,superuser:role.rolsuper,bypassRls:role.rolbypassrls,inherit:role.rolinherit,hasMemberships:ownership.rows[0].has_memberships},null,2));
} catch (error) {
  await client.query('ROLLBACK').catch(()=>{});
  throw error;
} finally { await client.end().catch(()=>{}); }