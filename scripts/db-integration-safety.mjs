import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const admin = new Client({ connectionString });
const a = new Client({ connectionString });
const b = new Client({ connectionString });
const ids = {
  tenantA: randomUUID(), tenantB: randomUUID(),
  outletA: randomUUID(), outletB: randomUUID(),
  tableA: randomUUID(), tableB: randomUUID(),
  sessionA: randomUUID(), sessionB: randomUUID()
};
const slug = randomUUID().replaceAll('-', '').slice(0, 16);

try {
  await admin.connect();
  await admin.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_runtime_test') THEN
        CREATE ROLE gastro_runtime_test NOLOGIN NOBYPASSRLS;
      END IF;
    END $$;
    GRANT gastro_runtime_test TO CURRENT_USER;
    GRANT USAGE ON SCHEMA public TO gastro_runtime_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gastro_runtime_test;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gastro_runtime_test;
  `);

  await admin.query('BEGIN');
  await admin.query(
    'INSERT INTO tenants (id, slug, name) VALUES ($1,$2,$3),($4,$5,$6)',
    [ids.tenantA, `rls-a-${slug}`, 'RLS Test Tenant A', ids.tenantB, `rls-b-${slug}`, 'RLS Test Tenant B']
  );
  await admin.query(
    'INSERT INTO outlets (id, tenant_id, slug, name) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
    [ids.outletA, ids.tenantA, 'test-outlet', 'Test Outlet A', ids.outletB, ids.tenantB, 'test-outlet', 'Test Outlet B']
  );
  await admin.query(
    'INSERT INTO dining_tables (id, tenant_id, outlet_id, table_code, display_name, capacity) VALUES ($1,$2,$3,$4,$5,2),($6,$7,$8,$9,$10,2)',
    [ids.tableA, ids.tenantA, ids.outletA, 'RLS-A', 'RLS A', ids.tableB, ids.tenantB, ids.outletB, 'RLS-B', 'RLS B']
  );
  await admin.query('COMMIT');

  await a.connect();
  await a.query('BEGIN');
  await a.query('SET LOCAL ROLE gastro_runtime_test');
  await a.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.outlet_id',$2,true)", [ids.tenantA, ids.outletA]);
  const visibleA = await a.query('SELECT id FROM dining_tables');
  if (visibleA.rowCount !== 1 || visibleA.rows[0].id !== ids.tableA) {
    throw new Error(`Tenant A saw unexpected rows: ${visibleA.rowCount}`);
  }

  await a.query('SAVEPOINT cross_tenant_write');
  let crossTenantWriteDenied = false;
  try {
    await a.query(
      'INSERT INTO dining_tables (tenant_id,outlet_id,table_code,display_name,capacity) VALUES ($1,$2,$3,$4,2)',
      [ids.tenantB, ids.outletB, `BAD-${slug}`, 'Must be denied']
    );
  } catch (error) {
    crossTenantWriteDenied = error.code === '42501';
    await a.query('ROLLBACK TO SAVEPOINT cross_tenant_write');
  }
  if (!crossTenantWriteDenied) throw new Error('RLS did not reject a cross-tenant INSERT');
  await a.query('ROLLBACK');

  await a.query('BEGIN');
  await a.query('SET LOCAL ROLE gastro_runtime_test');
  await a.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.outlet_id',$2,true)", [ids.tenantA, ids.outletB]);
  const wrongOutlet = await a.query('SELECT id FROM dining_tables');
  if (wrongOutlet.rowCount !== 0) throw new Error('RLS allowed access from the wrong outlet context');
  await a.query('ROLLBACK');

  // Verify the partial unique index serializes concurrent open sessions per table.
  await a.connect();
  await b.connect();
  await a.query('BEGIN');
  await a.query(
    "INSERT INTO dining_sessions (id,tenant_id,outlet_id,table_id,session_number,guest_count,status) VALUES ($1,$2,$3,$4,$5,2,'active')",
    [ids.sessionA, ids.tenantA, ids.outletA, ids.tableA, `S-A-${slug}`]
  );
  await b.query('BEGIN');
  const competingInsert = b.query(
    "INSERT INTO dining_sessions (id,tenant_id,outlet_id,table_id,session_number,guest_count,status) VALUES ($1,$2,$3,$4,$5,2,'active')",
    [ids.sessionB, ids.tenantA, ids.outletA, ids.tableA, `S-B-${slug}`]
  );
  await new Promise(resolve => setTimeout(resolve, 200));
  await a.query('COMMIT');
  let concurrentDuplicateRejected = false;
  try {
    await competingInsert;
    await b.query('COMMIT');
  } catch (error) {
    concurrentDuplicateRejected = error.code === '23505';
    await b.query('ROLLBACK').catch(() => {});
  }
  if (!concurrentDuplicateRejected) throw new Error('Concurrent duplicate open session was not rejected');

  // Idempotency keys must be unique inside a tenant/outlet scope.
  await admin.query(
    'INSERT INTO idempotency_keys (tenant_id,outlet_id,key,operation) VALUES ($1,$2,$3,$4)',
    [ids.tenantA, ids.outletA, `idem-${slug}`, 'test']
  );
  let duplicateIdempotencyRejected = false;
  try {
    await admin.query(
      'INSERT INTO idempotency_keys (tenant_id,outlet_id,key,operation) VALUES ($1,$2,$3,$4)',
      [ids.tenantA, ids.outletA, `idem-${slug}`, 'test']
    );
  } catch (error) {
    duplicateIdempotencyRejected = error.code === '23505';
  }
  if (!duplicateIdempotencyRejected) throw new Error('Duplicate idempotency key was accepted');

  console.log(JSON.stringify({
    tests: 'passed',
    rls: { tenantReadIsolation: true, crossTenantWriteDenied, wrongOutletDenied: true },
    concurrency: { oneOpenSessionPerTable: concurrentDuplicateRejected },
    idempotency: { duplicateKeyRejected: duplicateIdempotencyRejected }
  }, null, 2));
} finally {
  await a.query('ROLLBACK').catch(() => {});
  await b.query('ROLLBACK').catch(() => {});
  await admin.query('DELETE FROM idempotency_keys WHERE tenant_id = $1', [ids.tenantA]).catch(() => {});
  await admin.query('DELETE FROM dining_sessions WHERE tenant_id = $1', [ids.tenantA]).catch(() => {});
  await admin.query('DELETE FROM dining_tables WHERE tenant_id = ANY($1::uuid[])', [[ids.tenantA, ids.tenantB]]).catch(() => {});
  await admin.query('DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])', [[ids.tenantA, ids.tenantB]]).catch(() => {});
  await admin.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [[ids.tenantA, ids.tenantB]]).catch(() => {});
  await Promise.all([a.end().catch(() => {}), b.end().catch(() => {}), admin.end().catch(() => {})]);
}
