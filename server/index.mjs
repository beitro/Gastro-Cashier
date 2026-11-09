import express from 'express';
import pg from 'pg';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pg;
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
const scrypt = promisify(scryptCallback);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalizeRole = (role) => role === 'owner' || role === 'admin' || role === 'manager' ? 'owner' : role === 'finance' ? 'finance' : 'cashier';

async function hashCredential(value) {
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + Buffer.from(derived).toString('hex');
}
async function verifyCredential(value, encoded) {
  if (!encoded || !encoded.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = encoded.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = Buffer.from(await scrypt(value, Buffer.from(saltHex, 'hex'), expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function transaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

app.get('/api/health', asyncRoute(async (_req, res) => {
  const r = await pool.query('SELECT current_setting($1) AS version', ['server_version']);
  res.json({ ok: true, database: 'postgresql', version: r.rows[0].version });
}));

// One-time tenant/outlet/staff provisioning. Keep BOOTSTRAP_TOKEN out of source control.
app.post('/api/bootstrap', asyncRoute(async (req, res) => {
  if (!process.env.BOOTSTRAP_TOKEN || req.get('x-bootstrap-token') !== process.env.BOOTSTRAP_TOKEN) return res.status(403).json({ error: 'Bootstrap tidak diizinkan.' });
  const { tenantName, tenantSlug, outletName, outletSlug, staffName, email, pin, nfcUid } = req.body || {};
  if (![tenantName,tenantSlug,outletName,outletSlug,staffName,pin].every(v => typeof v === 'string' && v.trim()) || !/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'Data tenant/outlet/staff wajib diisi; PIN 4–8 digit.' });
  const pinHash = await hashCredential(pin);
  const nfcHash = nfcUid ? await hashCredential(String(nfcUid).trim().toUpperCase()) : null;
  const created = await transaction(async c => {
    const t = (await c.query('INSERT INTO tenants(slug,name) VALUES($1,$2) RETURNING id', [tenantSlug,tenantName])).rows[0];
    const o = (await c.query('INSERT INTO outlets(tenant_id,slug,name) VALUES($1,$2,$3) RETURNING id', [t.id,outletSlug,outletName])).rows[0];
    await c.query('INSERT INTO tenant_settings(tenant_id) VALUES($1)', [t.id]);
    const staff = (await c.query('INSERT INTO staff_accounts(email,display_name,pin_hash,nfc_credential_hash) VALUES($1,$2,$3,$4) RETURNING id', [email || null,staffName,pinHash,nfcHash])).rows[0];
    const membership = (await c.query("INSERT INTO tenant_memberships(tenant_id,staff_id,role_code) VALUES($1,$2,'owner') RETURNING id", [t.id,staff.id])).rows[0];
    await c.query("INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code) VALUES($1,$2,$3,'owner')", [t.id,o.id,membership.id]);
    return { tenantId:t.id,outletId:o.id,staffId:staff.id };
  });
  res.status(201).json({ ok:true,...created });
}));

async function authenticate(req, res, next) {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i,'');
    if (!token) return res.status(401).json({ error:'Sesi login diperlukan.' });
    const result = await pool.query(\`SELECT s.id AS session_id, a.id AS staff_id, a.display_name,
      tm.role_code, t.id AS tenant_id, t.name AS tenant_name, o.id AS outlet_id, o.name AS outlet_name
      FROM staff_sessions s JOIN staff_accounts a ON a.id=s.staff_id
      JOIN tenant_memberships tm ON tm.tenant_id=s.tenant_id AND tm.staff_id=a.id AND tm.status='active'
      JOIN outlet_memberships om ON om.tenant_id=s.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=s.outlet_id AND om.status='active'
      JOIN tenants t ON t.id=s.tenant_id AND t.status='active'
      JOIN outlets o ON o.id=s.outlet_id AND o.status='active'
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.status='active' LIMIT 1\`, [sha256(token)]);
    if (!result.rowCount) return res.status(401).json({ error:'Sesi tidak valid atau sudah kedaluwarsa.' });
    req.auth = result.rows[0]; req.tokenHash = sha256(token); next();
  } catch (error) { next(error); }
}

async function issueSession(staffId, credentialColumn, credential, res) {
  const matches = await pool.query(\`SELECT a.id AS staff_id,a.display_name,tm.role_code,t.id AS tenant_id,t.name AS tenant_name,o.id AS outlet_id,o.name AS outlet_name,a.\${credentialColumn} AS credential_hash
    FROM staff_accounts a JOIN tenant_memberships tm ON tm.staff_id=a.id AND tm.status='active'
    JOIN tenants t ON t.id=tm.tenant_id AND t.status='active'
    JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.status='active'
    JOIN outlets o ON o.id=om.outlet_id AND o.status='active'
    WHERE a.id=$1 AND a.status='active' ORDER BY t.created_at,o.created_at LIMIT 20\`, [staffId]);
  const matched = [];
  for (const row of matches.rows) if (await verifyCredential(credential,row.credential_hash)) matched.push(row);
  if (!matched.length) return res.status(401).json({ error:'Kredensial tidak valid atau akun tidak aktif.' });
  if (matched.length > 1) return res.status(409).json({ error:'Staff memiliki lebih dari satu outlet. Endpoint pemilihan outlet perlu digunakan.' });
  const row = matched[0], token = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO staff_sessions(staff_id,tenant_id,outlet_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval \\'12 hours\\')', [row.staff_id,row.tenant_id,row.outlet_id,sha256(token)]);
  res.json({ token, expiresIn:43200, staff:{ id:row.staff_id,name:row.display_name,role:normalizeRole(row.role_code),roleCode:row.role_code,tenantId:row.tenant_id,tenantName:row.tenant_name,outletId:row.outlet_id,outletName:row.outlet_name,pin:'',nfcTagUid:'',avatarColor:'bg-emerald-600',roleLabel:row.role_code } });
}

app.post('/api/auth/pin', asyncRoute(async (req,res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error:'PIN harus 4–8 digit.' });
  const candidates = await pool.query("SELECT id,pin_hash FROM staff_accounts WHERE status='active' AND pin_hash IS NOT NULL");
  const found = [];
  for (const row of candidates.rows) if (await verifyCredential(pin,row.pin_hash)) found.push(row);
  if (found.length !== 1) return res.status(401).json({ error:'PIN tidak valid atau akun tidak aktif.' });
  return issueSession(found[0].id,'pin_hash',pin,res);
}));
app.post('/api/auth/nfc', asyncRoute(async (req,res) => {
  const uid = String(req.body?.uid || '').trim().toUpperCase();
  if (!uid) return res.status(400).json({ error:'NFC UID wajib diisi.' });
  const candidates = await pool.query("SELECT id,nfc_credential_hash FROM staff_accounts WHERE status='active' AND nfc_credential_hash IS NOT NULL");
  const found = [];
  for (const row of candidates.rows) if (await verifyCredential(uid,row.nfc_credential_hash)) found.push(row);
  if (found.length !== 1) return res.status(401).json({ error:'Kartu NFC tidak dikenal atau tidak aktif.' });
  return issueSession(found[0].id,'nfc_credential_hash',uid,res);
}));
app.post('/api/auth/logout', authenticate, asyncRoute(async (req,res) => {
  await pool.query('UPDATE staff_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',[req.tokenHash]);
  res.json({ ok:true });
}));
app.get('/api/me', authenticate, (req,res) => {
  const a=req.auth; res.json({ id:a.staff_id,name:a.display_name,role:normalizeRole(a.role_code),tenantId:a.tenant_id,tenantName:a.tenant_name,outletId:a.outlet_id,outletName:a.outlet_name });
});

// All outlet data endpoints set transaction-local RLS context after resolving the server-side session.
app.get('/api/tables', authenticate, asyncRoute(async (req,res) => {
  const rows = await transaction(async c => {
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[req.auth.tenant_id,req.auth.outlet_id]);
    return (await c.query('SELECT * FROM v_table_board WHERE tenant_id=$1 AND outlet_id=$2 ORDER BY table_code',[req.auth.tenant_id,req.auth.outlet_id])).rows;
  });
  res.json(rows);
}));

app.use((err, _req, res, _next) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan server.' : err.message });
});
const port=Number(process.env.PORT || 8080);
const server=app.listen(port,'0.0.0.0',()=>console.log('Gastro-Cashier API listening on '+port));
async function shutdown(){server.close();await pool.end();process.exit(0);}
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
