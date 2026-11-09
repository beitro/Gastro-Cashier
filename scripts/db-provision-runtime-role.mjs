import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const password = process.env.RUNTIME_DB_PASSWORD;
const roleName = process.env.RUNTIME_DB_ROLE || 'gastro_runtime';
if (!adminUrl || !password || password.length < 24) throw new Error('ADMIN_DATABASE_URL and RUNTIME_DB_PASSWORD (at least 24 characters) are required.');
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(roleName)) throw new Error('RUNTIME_DB_ROLE must be a simple PostgreSQL identifier.');
const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const create = await client.query('SELECT format($q$CREATE ROLE %I LOGIN$q$, $1) AS sql WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$1)',[roleName]);
  if (create.rowCount) await client.query(create.rows[0].sql);
  const alter = await client.query('SELECT format($q$ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS$q$, $1, $2) AS sql',[roleName,password]);
  await client.query(alter.rows[0].sql);
  const grants = [
    ['GRANT CONNECT ON DATABASE %I TO %I','database'],
    ['GRANT USAGE ON SCHEMA public TO %I','schema'],
    ['GRANT SELECT ON tenants,outlets,staff_accounts,tenant_memberships,outlet_memberships,tenant_settings,outlet_settings,menu_categories,menu_items,dining_tables,dining_sessions,order_batches,order_items,payments,v_table_board,staff_sessions TO %I','select'],
    ['GRANT INSERT ON dining_sessions,order_batches,order_items,payments,payment_allocations,staff_sessions TO %I','insert'],
    ['GRANT UPDATE ON dining_sessions,order_items,staff_sessions TO %I','update']
  ];
  const db = (await client.query('SELECT current_database() AS name')).rows[0].name;
  for (const [template,kind] of grants) {
    let sql;
    if (kind === 'database') { const q=await client.query('SELECT format($q$'+template+'$q$, $1, $2) AS sql',[db,roleName]); sql=q.rows[0].sql; }
    else { const q=await client.query('SELECT format($q$'+template+'$q$, $1) AS sql',[roleName]); sql=q.rows[0].sql; }
    await client.query(sql);
  }
  const result=await client.query('SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit FROM pg_roles WHERE rolname=$1',[roleName]);
  const role=result.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolinherit) throw new Error('Runtime role privilege verification failed.');
  console.log(JSON.stringify({provisioned:true,role:role.rolname,superuser:role.rolsuper,bypassRls:role.rolbypassrls,inherit:role.rolinherit},null,2));
} finally { await client.end().catch(()=>{}); }