import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const secret = process.env.RLS_CONTEXT_HMAC_SECRET;
if (!adminUrl) throw new Error('ADMIN_DATABASE_URL is required.');
if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
  throw new Error('RLS_CONTEXT_HMAC_SECRET must be at least 32 bytes and match the API environment.');
}

const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query('BEGIN');
  const table = await client.query(
    "SELECT to_regclass('app_private.rls_context_keys') AS name"
  );
  if (!table.rows[0].name) {
    throw new Error('Signed RLS migration 004 must be applied by the schema owner before provisioning its key.');
  }
  await client.query(
    `INSERT INTO app_private.rls_context_keys(singleton,secret,updated_at)
     VALUES(TRUE,$1,now())
     ON CONFLICT(singleton) DO UPDATE SET secret=EXCLUDED.secret,updated_at=now()`,
    [Buffer.from(secret, 'utf8')]
  );
  const check = await client.query(
    'SELECT octet_length(secret) AS secret_bytes FROM app_private.rls_context_keys WHERE singleton=TRUE'
  );
  if (Number(check.rows[0]?.secret_bytes) !== Buffer.byteLength(secret, 'utf8')) {
    throw new Error('Stored RLS context key length verification failed.');
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ provisioned: true, keyBytes: Number(check.rows[0].secret_bytes) }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
