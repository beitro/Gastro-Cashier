import pg from 'pg';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import dotenv from 'dotenv';

dotenv.config();
const scrypt = promisify(scryptCallback);
const pin = String(process.env.POS_E2E_PIN || '');
const email = 'pos-e2e@gastro.test';
const tenantSlug = process.env.POS_E2E_TENANT_SLUG || 'gastro-ci-test-20261110';
const outletSlug = process.env.POS_E2E_OUTLET_SLUG || 'ci-test-outlet';
if (process.env.ALLOW_DEV_FIXTURE_PROVISIONING !== 'true' || process.env.NODE_ENV === 'production') {
  throw new Error('Set ALLOW_DEV_FIXTURE_PROVISIONING=true in a non-production environment to provision the isolated E2E staff account.');
}
if (!/^\d{4}$/.test(pin)) throw new Error('POS_E2E_PIN must be exactly 4 digits.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
const salt = randomBytes(16);
const derived = await scrypt(pin, salt, 64);
const pinHash = 'scrypt$' + salt.toString('hex') + '$' + Buffer.from(derived).toString('hex');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const target = await client.query(`SELECT t.id AS tenant_id,o.id AS outlet_id
    FROM public.tenants t JOIN public.outlets o ON o.tenant_id=t.id
    WHERE t.slug=$1 AND o.slug=$2 AND t.status='active' AND o.status='active'`, [tenantSlug, outletSlug]);
  if (target.rowCount !== 1) throw new Error('Expected one active isolated development tenant/outlet; refusing to provision.');
  const { tenant_id: tenantId, outlet_id: outletId } = target.rows[0];
  let staff = await client.query('SELECT id FROM public.staff_accounts WHERE email=$1 FOR UPDATE', [email]);
  let staffId;
  if (staff.rowCount) {
    staffId = staff.rows[0].id;
    await client.query("UPDATE public.staff_accounts SET display_name='POS E2E Test Cashier',pin_hash=$1,status='active' WHERE id=$2", [pinHash, staffId]);
  } else {
    const created = await client.query("INSERT INTO public.staff_accounts(email,display_name,pin_hash,status) VALUES($1,'POS E2E Test Cashier',$2,'active') RETURNING id", [email, pinHash]);
    staffId = created.rows[0].id;
  }
  let membership = await client.query('SELECT id FROM public.tenant_memberships WHERE tenant_id=$1 AND staff_id=$2 FOR UPDATE', [tenantId, staffId]);
  let membershipId;
  if (membership.rowCount) {
    membershipId = membership.rows[0].id;
    await client.query("UPDATE public.tenant_memberships SET role_code='owner',status='active' WHERE id=$1", [membershipId]);
  } else {
    const created = await client.query("INSERT INTO public.tenant_memberships(tenant_id,staff_id,role_code,status) VALUES($1,$2,'owner','active') RETURNING id", [tenantId, staffId]);
    membershipId = created.rows[0].id;
  }
  const outletMembership = await client.query('SELECT id FROM public.outlet_memberships WHERE tenant_id=$1 AND outlet_id=$2 AND tenant_membership_id=$3 FOR UPDATE', [tenantId, outletId, membershipId]);
  if (outletMembership.rowCount) {
    await client.query("UPDATE public.outlet_memberships SET role_code='owner',status='active' WHERE id=$1", [outletMembership.rows[0].id]);
  } else {
    await client.query("INSERT INTO public.outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code,status) VALUES($1,$2,$3,'owner','active')", [tenantId, outletId, membershipId]);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ ok: true, email, staffId, tenantSlug, outletSlug, pinConfigured: true }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
