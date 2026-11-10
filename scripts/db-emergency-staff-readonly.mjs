import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL for the runtime role is required.');

const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
const denied = [];
try {
  await client.connect();
  const identity = await client.query(`SELECT current_user AS role, r.rolsuper, r.rolbypassrls
    FROM pg_roles r WHERE r.rolname=current_user`);
  if (!identity.rowCount || identity.rows[0].rolsuper || identity.rows[0].rolbypassrls) {
    throw new Error('Test must run as a non-superuser, non-BYPASSRLS runtime role.');
  }

  // Match the exact read-only staff-directory projection used by GET /api/admin/staff.
  await client.query(`SELECT a.id,a.display_name,a.email,a.phone,a.status,tm.role_code,
    (a.pin_hash IS NOT NULL) AS has_pin,(a.nfc_credential_hash IS NOT NULL) AS has_nfc,a.created_at
    FROM staff_accounts a
    JOIN tenant_memberships tm ON tm.staff_id=a.id AND tm.tenant_id=$1
    JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=$2
    LIMIT 0`, ['00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000']);

  const statements = [
    ['staff_accounts INSERT', `INSERT INTO staff_accounts(id,display_name) VALUES(gen_random_uuid(),'emergency-test')`],
    ['staff_accounts UPDATE', `UPDATE staff_accounts SET display_name=display_name WHERE FALSE`],
    ['staff_accounts DELETE', `DELETE FROM staff_accounts WHERE FALSE`],
    ['tenant_memberships INSERT', `INSERT INTO tenant_memberships DEFAULT VALUES`],
    ['tenant_memberships UPDATE', `UPDATE tenant_memberships SET role_code=role_code WHERE FALSE`],
    ['tenant_memberships DELETE', `DELETE FROM tenant_memberships WHERE FALSE`],
    ['outlet_memberships INSERT', `INSERT INTO outlet_memberships DEFAULT VALUES`],
    ['outlet_memberships UPDATE', `UPDATE outlet_memberships SET role_code=role_code WHERE FALSE`],
    ['outlet_memberships DELETE', `DELETE FROM outlet_memberships WHERE FALSE`],
  ];

  for (const [label, sql] of statements) {
    try {
      await client.query(sql);
      throw new Error(`SECURITY FAILURE: runtime role unexpectedly executed ${label}`);
    } catch (error) {
      if (error.message.startsWith('SECURITY FAILURE:')) throw error;
      if (error.code !== '42501') throw new Error(`${label} failed for unexpected reason: ${error.message}`);
      denied.push(label);
    }
  }

  const grants = await client.query(`
    SELECT
      has_any_column_privilege(current_user,'public.staff_accounts','SELECT') AS can_read_staff,
      has_any_column_privilege(current_user,'public.staff_accounts','INSERT') AS can_insert_staff_columns,
      has_any_column_privilege(current_user,'public.staff_accounts','UPDATE') AS can_update_staff_columns,
      has_table_privilege(current_user,'public.tenant_memberships','INSERT') AS can_insert_tenant_memberships,
      has_any_column_privilege(current_user,'public.tenant_memberships','UPDATE') AS can_update_tenant_memberships,
      has_table_privilege(current_user,'public.outlet_memberships','INSERT') AS can_insert_outlet_memberships,
      has_any_column_privilege(current_user,'public.outlet_memberships','UPDATE') AS can_update_outlet_memberships
  `);
  const g = grants.rows[0];
  if (!g.can_read_staff || g.can_insert_staff_columns || g.can_update_staff_columns ||
      g.can_insert_tenant_memberships || g.can_update_tenant_memberships ||
      g.can_insert_outlet_memberships || g.can_update_outlet_memberships) {
    throw new Error('Runtime privilege allowlist does not match emergency staff-read-only policy: '+JSON.stringify(g));
  }

  console.log(JSON.stringify({ ok:true, runtimeRole:identity.rows[0].role, staffReadAllowed:true, deniedMutations:denied, privileges:g },null,2));
} finally {
  await client.end().catch(()=>{});
}
