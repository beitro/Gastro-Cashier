import express from 'express';
import pg from 'pg';
import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pg;
const app = express();
app.disable('x-powered-by');
const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Accept,Authorization,Content-Type,x-bootstrap-token');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    if (origin && !allowedOrigins.has(origin)) return res.status(403).end();
    return res.status(204).end();
  }
  next();
});
app.use(express.json({ limit: '256kb' }));
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 10.');
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
function resolveRuntimeConnectionString() {
  const url = process.env.DATABASE_URL || '';
  if (!url) return url;
  // If the integration provisioned neondb_owner, switch user to the safe unprivileged runtime role gastro_runtime
  try {
    const parsed = new URL(url);
    if (parsed.username === 'neondb_owner') {
      parsed.username = 'gastro_runtime';
      return parsed.toString();
    }
  } catch {}
  return url;
}

const pool = new Pool({
  connectionString: resolveRuntimeConnectionString(),
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  connectionTimeoutMillis: 5000,
});
const bootstrapPool = process.env.BOOTSTRAP_DATABASE_URL ? new Pool({ connectionString: process.env.BOOTSTRAP_DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined, max: 2, connectionTimeoutMillis: 5000 }) : null;
const scrypt = promisify(scryptCallback);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const rlsContextSecret = process.env.RLS_CONTEXT_HMAC_SECRET;
if (!rlsContextSecret || Buffer.byteLength(rlsContextSecret, 'utf8') < 32) {
  throw new Error('RLS_CONTEXT_HMAC_SECRET must be configured with at least 32 bytes before starting the API.');
}
function signRlsContext(claims) {
  const now = Math.floor(Date.now() / 1000);
  const payloadBytes = Buffer.from(JSON.stringify({
    v: '1', iat: now, exp: now + 60, jti: randomBytes(16).toString('hex'),
    ...claims
  }), 'utf8');
  const payload = payloadBytes.toString('base64url');
  const signature = createHmac('sha256', rlsContextSecret).update(payloadBytes).digest('base64url');
  return payload + '.' + signature;
}
async function setRlsContext(client, claims) {
  const tx = await client.query('SELECT txid_current()::text AS txid');
  await client.query(
    "SELECT set_config('app.tenant_id',$1,true), set_config('app.outlet_id',$2,true)",
    [claims.tenant_id || '', claims.outlet_id || '']
  );
  await client.query("SELECT set_config('app.context_token',$1,true)", [signRlsContext({ ...claims, txid: tx.rows[0].txid })]);
}
const normalizeRole = (role) => ['owner','manager','finance','cashier','waiter','kitchen'].includes(role) ? role : null;
function requireOwner(req,res,next) { if (!req.auth || req.auth.role_code !== 'owner') return res.status(403).json({error:'Hanya Owner yang dapat mengelola staff.'}); next(); }
function requirePosRole(req, res, next) {
  if (!req.auth || !['owner','manager','cashier','waiter'].includes(normalizeRole(req.auth.role_code))) {
    return res.status(403).json({ error:'Role Anda tidak memiliki izin untuk operasi POS.' });
  }
  next();
}
function requireKdsOrPosRole(req, res, next) {
  if (!req.auth || !['owner','manager','cashier','waiter','kitchen'].includes(normalizeRole(req.auth.role_code))) {
    return res.status(403).json({ error:'Role Anda tidak memiliki izin untuk operasi KDS/POS.' });
  }
  next();
}
function requireManagerOrOwner(req,res,next) {
  if (!req.auth || !['owner','manager'].includes(normalizeRole(req.auth.role_code))) return res.status(403).json({error:'Pembatalan hanya dapat dilakukan Manager atau Owner.'});
  next();
}
function requireSettlementRole(req,res,next) {
  if (!req.auth || !['owner','manager','finance'].includes(normalizeRole(req.auth.role_code))) return res.status(403).json({error:'Konfirmasi pembayaran hanya dapat dilakukan Manager, Owner, atau Finance.'});
  next();
}

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
async function transaction(fn, dbPool = pool) {
  const client = await dbPool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
function asyncRoute(fn) {
  return (req, res, next) =>
    Promise.resolve()
      .then(() => (process.env.VERCEL ? ensureSafeRuntimeRole() : undefined))
      .then(() => fn(req, res, next))
      .catch(next);
}
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 5;
const AUTH_BLOCK_MS = 30 * 1000;
function authScopeHash(req) { return sha256(String(req.ip || req.socket?.remoteAddress || 'unknown')); }
async function consumeAuthAttempt(req) {
  const scopeHash = authScopeHash(req);
  return transaction(async c => {
    await setRlsContext(c, { capabilities: ['auth_rate_limit'] });
    await c.query('INSERT INTO auth_rate_limits(scope_hash) VALUES($1) ON CONFLICT(scope_hash) DO NOTHING', [scopeHash]);
    const result = await c.query('SELECT failed_attempts,window_started_at,blocked_until FROM auth_rate_limits WHERE scope_hash=$1 FOR UPDATE', [scopeHash]);
    const row = result.rows[0], now = Date.now();
    const blockedUntil = row.blocked_until ? new Date(row.blocked_until).getTime() : 0;
    if (blockedUntil > now) return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
    const windowExpired = now - new Date(row.window_started_at).getTime() >= AUTH_WINDOW_MS;
    if (windowExpired || blockedUntil) {
      await c.query('UPDATE auth_rate_limits SET failed_attempts=1,window_started_at=now(),blocked_until=NULL,updated_at=now() WHERE scope_hash=$1', [scopeHash]);
      return 0;
    }
    if (row.failed_attempts >= AUTH_MAX_ATTEMPTS) {
      const blocked = await c.query("UPDATE auth_rate_limits SET blocked_until=now()+($2 * interval '1 millisecond'),updated_at=now() WHERE scope_hash=$1 RETURNING blocked_until", [scopeHash, AUTH_BLOCK_MS]);
      return Math.max(1, Math.ceil((new Date(blocked.rows[0].blocked_until).getTime() - now) / 1000));
    }
    await c.query('UPDATE auth_rate_limits SET failed_attempts=failed_attempts+1,updated_at=now() WHERE scope_hash=$1', [scopeHash]);
    return 0;
  });
}
async function clearAuthAttempts(req) {
  await transaction(async c => {
    await setRlsContext(c, { capabilities: ['auth_rate_limit'] });
    await c.query('UPDATE auth_rate_limits SET failed_attempts=0,window_started_at=now(),blocked_until=NULL,updated_at=now() WHERE scope_hash=$1', [authScopeHash(req)]);
  });
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  const r = await pool.query('SELECT current_setting($1) AS version', ['server_version']);
  res.json({ ok: true, database: 'postgresql', version: r.rows[0].version });
}));

// Emergency release: bootstrap creates a staff account through the separate privileged connection unless ALLOW_BOOTSTRAP=true.
app.use('/api/bootstrap', (req,res,next) => {
  if (req.method !== 'POST') return next();
  if (process.env.EMERGENCY_STAFF_READONLY !== 'true' || process.env.ALLOW_BOOTSTRAP === 'true') return next();
  return res.status(423).json({ error:'Bootstrap dinonaktifkan selama emergency release; provisioning harus dilakukan di luar API runtime.', code:'BOOTSTRAP_DISABLED' });
});

// One-time tenant/outlet/staff provisioning. Keep BOOTSTRAP_TOKEN out of source control.
app.post('/api/bootstrap', asyncRoute(async (req, res) => {
  const allowQaBootstrap = process.env.ALLOW_BOOTSTRAP === 'true';
  const validToken = Boolean(process.env.BOOTSTRAP_TOKEN && req.get('x-bootstrap-token') === process.env.BOOTSTRAP_TOKEN);
  if (!validToken && !allowQaBootstrap) return res.status(403).json({ error: 'Bootstrap tidak diizinkan.' });
  const targetPool = bootstrapPool || (allowQaBootstrap ? pool : null);
  if (!targetPool) return res.status(503).json({ error: 'Bootstrap nonaktif: BOOTSTRAP_DATABASE_URL belum dikonfigurasi.' });
  const body = req.body || {};
  const tenantName = String(body.tenantName || (allowQaBootstrap ? 'Resto Nusantara' : '')).trim();
  const tenantSlug = String(body.tenantSlug || (allowQaBootstrap ? 'resto-nusantara' : '')).trim();
  const outletName = String(body.outletName || (allowQaBootstrap ? 'Resto Nusantara - Outlet Utama' : '')).trim();
  const outletSlug = String(body.outletSlug || (allowQaBootstrap ? 'outlet-utama' : '')).trim();
  const staffName = String(body.staffName || (allowQaBootstrap ? 'Hendrawan Kusuma' : '')).trim();
  const email = body.email ? String(body.email).trim().toLowerCase() : (allowQaBootstrap ? 'owner@nusantara.id' : null);
  const pin = String(body.pin || (allowQaBootstrap ? '9999' : '')).trim();
  const nfcUid = body.nfcUid ? String(body.nfcUid).trim().toUpperCase() : null;
  if (![tenantName,tenantSlug,outletName,outletSlug,staffName,pin].every(v => typeof v === 'string' && v.trim()) || !/^\d{4,8}$/.test(pin)) {
    return res.status(400).json({ error: 'Data tenant/outlet/staff wajib diisi; PIN 4–8 digit.' });
  }
  const pinHash = await hashCredential(pin);
  const nfcHash = nfcUid ? await hashCredential(nfcUid) : null;
  const created = await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('gastro_cashier_one_time_bootstrap'))");
    await setRlsContext(c, { capabilities: ['bootstrap'] });
    if ((await c.query('SELECT 1 FROM tenants LIMIT 1')).rowCount) return { alreadyBootstrapped: true };
    const t = (await c.query('INSERT INTO tenants(slug,name) VALUES($1,$2) RETURNING id', [tenantSlug,tenantName])).rows[0];
    const o = (await c.query('INSERT INTO outlets(tenant_id,slug,name) VALUES($1,$2,$3) RETURNING id', [t.id,outletSlug,outletName])).rows[0];
    await setRlsContext(c, { tenant_id: t.id, outlet_id: o.id, capabilities: ['bootstrap','tenant_scope'] });
    await c.query('INSERT INTO tenant_settings(tenant_id) VALUES($1)', [t.id]);
    const staff = (await c.query('INSERT INTO staff_accounts(email,display_name,pin_hash,nfc_credential_hash) VALUES($1,$2,$3,$4) RETURNING id', [email,staffName,pinHash,nfcHash])).rows[0];
    const membership = (await c.query("INSERT INTO tenant_memberships(tenant_id,staff_id,role_code) VALUES($1,$2,'owner') RETURNING id", [t.id,staff.id])).rows[0];
    await c.query("INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code) VALUES($1,$2,$3,'owner')", [t.id,o.id,membership.id]);
    return { tenantId:t.id,outletId:o.id,staffId:staff.id };
  }, targetPool);
  if (created.alreadyBootstrapped) return res.status(409).json({ error:'Bootstrap sudah pernah diselesaikan. Endpoint ini hanya untuk provisioning awal.' });
  res.status(201).json({ ok:true,...created });
}));

async function authenticate(req, res, next) {
  try {
    if (process.env.VERCEL) await ensureSafeRuntimeRole();
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i,'');
    if (!token) return res.status(401).json({ error:'Sesi login diperlukan.' });
    const tokenHash = sha256(token);
    const auth = await transaction(async c => {
      await setRlsContext(c, { capabilities: ['session_lookup'], session_token_hash: tokenHash });
      const session = await c.query("SELECT staff_id,tenant_id,outlet_id FROM staff_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",[tokenHash]);
      if (!session.rowCount) return null;
      await setRlsContext(c, { tenant_id: session.rows[0].tenant_id, outlet_id: session.rows[0].outlet_id, capabilities: ['tenant_scope','session_lookup'], session_token_hash: tokenHash });
      const result = await c.query(`SELECT s.id AS session_id, a.id AS staff_id, a.display_name,
        tm.role_code, t.id AS tenant_id, t.name AS tenant_name, o.id AS outlet_id, o.name AS outlet_name
        FROM staff_sessions s JOIN staff_accounts a ON a.id=s.staff_id
        JOIN tenant_memberships tm ON tm.tenant_id=s.tenant_id AND tm.staff_id=a.id AND tm.status='active'
        JOIN outlet_memberships om ON om.tenant_id=s.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=s.outlet_id AND om.status='active'
        JOIN tenants t ON t.id=s.tenant_id AND t.status='active'
        JOIN outlets o ON o.id=s.outlet_id AND o.status='active'
        WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.status='active' LIMIT 1`,[tokenHash]);
      return result.rows[0] || null;
    });
    if (!auth) return res.status(401).json({ error:'Sesi tidak valid atau sudah kedaluwarsa.' });
    req.auth = auth; req.tokenHash = tokenHash; next();
  } catch (error) { next(error); }
}

async function issueSession(staffId, credentialColumn, credential, res) {
  const issued = await transaction(async c => {
    await setRlsContext(c, { capabilities: ['auth_lookup'] });
    const matches = await c.query(`SELECT a.id AS staff_id,a.display_name,a.status AS account_status,tm.role_code,tm.status AS tm_status,om.status AS om_status,t.id AS tenant_id,t.name AS tenant_name,o.id AS outlet_id,o.name AS outlet_name,a.${credentialColumn} AS credential_hash
      FROM staff_accounts a JOIN tenant_memberships tm ON tm.staff_id=a.id
      JOIN tenants t ON t.id=tm.tenant_id AND t.status='active'
      JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id
      JOIN outlets o ON o.id=om.outlet_id AND o.status='active'
      WHERE a.id=$1 ORDER BY t.created_at,o.created_at LIMIT 20`,[staffId]);
    const matched = [];
    for (const row of matches.rows) if (await verifyCredential(credential,row.credential_hash)) matched.push(row);
    if (!matched.length) return { error:'invalid' };
    const activeMatched = matched.filter(r => r.account_status === 'active' && r.tm_status === 'active' && r.om_status === 'active');
    if (!activeMatched.length) return { error:'blocked' };
    if (activeMatched.length > 1) return { error:'multiple' };
    if (!normalizeRole(activeMatched[0].role_code)) return { error:'role' };
    const row = activeMatched[0], token = randomBytes(32).toString('base64url');
    await setRlsContext(c, { tenant_id: row.tenant_id, outlet_id: row.outlet_id, actor_staff_id: row.staff_id, role_code: row.role_code, capabilities: ['session_create'] });
    await c.query('INSERT INTO staff_sessions(staff_id,tenant_id,outlet_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+make_interval(hours => 12))',[row.staff_id,row.tenant_id,row.outlet_id,sha256(token)]);
    return { row, token };
  });
  if (issued.error === 'blocked') return res.status(403).json({ error:'Akun karyawan ini sedang diblokir atau dinonaktifkan. Hubungi Owner.', code:'ACCOUNT_BLOCKED' });
  if (issued.error === 'invalid') return res.status(401).json({ error:'Kredensial tidak valid atau akun tidak aktif.' });
  if (issued.error === 'multiple') return res.status(409).json({ error:'Staff memiliki lebih dari satu outlet. Endpoint pemilihan outlet perlu digunakan.' });
  if (issued.error === 'role') return res.status(403).json({ error:'Role staff belum dikenali. Hubungi administrator.' });
  const { row, token } = issued;
  res.json({ token, expiresIn:43200, staff:{ id:row.staff_id,name:row.display_name,role:normalizeRole(row.role_code),roleCode:row.role_code,tenantId:row.tenant_id,tenantName:row.tenant_name,outletId:row.outlet_id,outletName:row.outlet_name,pin:'',nfcTagUid:'',avatarColor:'bg-emerald-600',roleLabel:row.role_code } });
}

app.post('/api/auth/pin', asyncRoute(async (req,res) => {
  const pin = String(req.body?.pin || '').trim();
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error:'PIN harus 4–8 digit angka.' });
  const retryAfter = await consumeAuthAttempt(req);
  if (retryAfter) { res.set('Retry-After', String(retryAfter)); return res.status(429).json({ error:'Terlalu banyak percobaan autentikasi. Coba lagi nanti.' }); }
  const candidates = await transaction(async c => { await setRlsContext(c, { capabilities: ['auth_lookup'] }); return c.query("SELECT id,status,pin_hash FROM staff_accounts WHERE pin_hash IS NOT NULL"); });
  const found = [];
  for (const row of candidates.rows) if (await verifyCredential(pin,row.pin_hash)) found.push(row);
  const activeFound = found.filter(r => r.status === 'active');
  if (!activeFound.length && found.length === 1) {
    return res.status(403).json({ error:'Akun karyawan ini sedang diblokir atau dinonaktifkan. Hubungi Owner.', code:'ACCOUNT_BLOCKED' });
  }
  if (activeFound.length !== 1) return res.status(401).json({ error:'PIN tidak valid atau akun tidak aktif.' });
  await clearAuthAttempts(req);
  return issueSession(activeFound[0].id,'pin_hash',pin,res);
}));
app.post('/api/auth/nfc', asyncRoute(async (req,res) => {
  const uid = String(req.body?.uid || '').trim().toUpperCase();
  if (!uid) return res.status(400).json({ error:'NFC UID wajib diisi.' });
  const retryAfter = await consumeAuthAttempt(req);
  if (retryAfter) { res.set('Retry-After', String(retryAfter)); return res.status(429).json({ error:'Terlalu banyak percobaan autentikasi. Coba lagi nanti.' }); }
  const candidates = await transaction(async c => { await setRlsContext(c, { capabilities: ['auth_lookup'] }); return c.query("SELECT id,status,nfc_credential_hash FROM staff_accounts WHERE nfc_credential_hash IS NOT NULL"); });
  const found = [];
  for (const row of candidates.rows) if (await verifyCredential(uid,row.nfc_credential_hash)) found.push(row);
  const activeFound = found.filter(r => r.status === 'active');
  if (!activeFound.length && found.length === 1) {
    return res.status(403).json({ error:'Akun karyawan ini sedang diblokir atau dinonaktifkan. Hubungi Owner.', code:'ACCOUNT_BLOCKED' });
  }
  if (activeFound.length !== 1) return res.status(401).json({ error:'Kartu NFC tidak dikenal atau tidak aktif.' });
  await clearAuthAttempts(req);
  return issueSession(activeFound[0].id,'nfc_credential_hash',uid,res);
}));
app.post('/api/auth/logout', authenticate, asyncRoute(async (req,res) => {
  await transaction(async c => {
    await setRlsContext(c, { tenant_id: req.auth.tenant_id, outlet_id: req.auth.outlet_id, actor_staff_id: req.auth.staff_id, role_code: req.auth.role_code, session_token_hash: req.tokenHash, capabilities: ['tenant_scope','session_revoke_self'] });
    return c.query('UPDATE staff_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',[req.tokenHash]);
  });
  res.json({ ok:true });
}));

app.post("/api/auth/verify-manager-pin", authenticate, asyncRoute(async (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  if (!/^\d{4,8}$/.test(pin)) {
    return res.status(400).json({ error: "PIN Manager harus 4–8 digit angka." });
  }

  const managers = await transaction(async c => {
    await setRlsContext(c, { capabilities: ["auth_lookup"] });
    return c.query(`
      SELECT s.id, s.display_name, tm.role_code, s.pin_hash, s.status
      FROM staff_accounts s
      JOIN tenant_memberships tm ON tm.staff_id = s.id
      JOIN outlet_memberships om ON om.tenant_membership_id = tm.id
      WHERE tm.tenant_id = $1 AND om.outlet_id = $2
        AND tm.role_code IN ('manager', 'owner')
        AND s.status = 'active' AND tm.status = 'active' AND om.status = 'active'
        AND s.pin_hash IS NOT NULL
    `, [req.auth.tenant_id, req.auth.outlet_id]);
  });

  for (const mgr of managers.rows) {
    if (await verifyCredential(pin, mgr.pin_hash)) {
      return res.json({
        ok: true,
        approved: true,
        managerId: mgr.id,
        managerName: mgr.display_name,
        role: mgr.role_code
      });
    }
  }

  return res.status(401).json({ error: "PIN Manager tidak cocok atau akun tidak memiliki otoritas Manager/Owner." });
}));

app.get('/api/me', authenticate, (req,res) => {
  const a=req.auth; res.json({ id:a.staff_id,name:a.display_name,role:normalizeRole(a.role_code),tenantId:a.tenant_id,tenantName:a.tenant_name,outletId:a.outlet_id,outletName:a.outlet_name });
});


// Shared request helper: every tenant-scoped query runs with transaction-local RLS context.
async function scoped(req, fn) {
  return transaction(async c => {
    await setRlsContext(c, { tenant_id: req.auth.tenant_id, outlet_id: req.auth.outlet_id, actor_staff_id: req.auth.staff_id, role_code: req.auth.role_code, capabilities: ['tenant_scope'] });
    return fn(c);
  });
}

async function adminScoped(req,fn) {
  return transaction(async c=>{
    await setRlsContext(c, { tenant_id: req.auth.tenant_id, outlet_id: req.auth.outlet_id, actor_staff_id: req.auth.staff_id, role_code: req.auth.role_code, capabilities: ['tenant_scope','staff_admin'] });
    return fn(c);
  });
}
async function writeAdminAudit(c,req,action,staffId,beforeData,afterData,metadata={}) {
  await c.query('INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id,ip_address,user_agent,before_data,after_data,metadata) VALUES($1,$2,$3,$4,\'staff\',$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)',
    [req.auth.tenant_id,req.auth.outlet_id,req.auth.staff_id,action,staffId,req.ip||null,req.get('user-agent')||null,JSON.stringify(beforeData),JSON.stringify(afterData),JSON.stringify(metadata)]);
}
// Optional emergency release freeze: only active when EMERGENCY_STAFF_READONLY=true.
app.use('/api/admin/staff', (req,res,next) => {
  if (process.env.EMERGENCY_STAFF_READONLY !== 'true') return next();
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return res.status(423).json({ error:'Administrasi staff sementara read-only selama emergency release POS.', code:'STAFF_ADMIN_READ_ONLY' });
});
const ADMIN_ROLES=['owner','manager','cashier','waiter','kitchen','finance'];
app.get('/api/admin/staff',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const rows=await adminScoped(req,c=>c.query(`SELECT a.id,a.display_name,a.email,a.phone,a.status,tm.role_code,
    (a.status='active' AND tm.status='active' AND om.status='active') AS is_active,
    (a.pin_hash IS NOT NULL) AS has_pin,(a.nfc_credential_hash IS NOT NULL) AS has_nfc,a.created_at
    FROM staff_accounts a
    JOIN tenant_memberships tm ON tm.staff_id=a.id AND tm.tenant_id=$1
    JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=$2
    ORDER BY a.display_name`,[req.auth.tenant_id,req.auth.outlet_id]));
  res.json(rows.rows);
}));
app.post('/api/admin/staff',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const name=String(req.body?.displayName ?? req.body?.name ?? '').trim();
  const email=req.body?.email?String(req.body.email).trim().toLowerCase():null;
  const phone=req.body?.phone?String(req.body.phone).trim():null;
  const nfcUid=req.body?.nfcUid?String(req.body.nfcUid).trim().toUpperCase():null;
  const role=String(req.body?.roleCode ?? req.body?.role ?? '').trim().toLowerCase();
  const pin=String(req.body?.pin||'').trim();
  if(!name||name.length>120||!ADMIN_ROLES.includes(role)||!/^\d{4,8}$/.test(pin)||(email&&(email.length>254||!/^\S+@\S+\.\S+$/.test(email)))||(phone&&(phone.length>40||!/^\+?[0-9 ()-]{6,40}$/.test(phone)))||(nfcUid&&nfcUid.length>200)){
    return res.status(400).json({error:'Nama lengkap, role POS, dan PIN (4–8 digit) wajib valid.'});
  }

  // Guard: PIN yang sudah digunakan tidak boleh digunakan lagi
  const existingPins = await adminScoped(req, async c => {
    return c.query(`
      SELECT a.id, a.pin_hash 
      FROM staff_accounts a 
      JOIN tenant_memberships tm ON tm.staff_id=a.id 
      WHERE tm.tenant_id=$1 AND a.pin_hash IS NOT NULL
    `, [req.auth.tenant_id]);
  });
  for (const row of existingPins.rows) {
    if (await verifyCredential(pin, row.pin_hash)) {
      return res.status(400).json({ error: 'PIN ini sudah digunakan oleh akun lain. Gunakan kombinasi PIN yang berbeda.' });
    }
  }

  const pinHash=await hashCredential(pin);
  const nfcHash=nfcUid?await hashCredential(nfcUid):null;
  const staffId=randomUUID();
  const created=await adminScoped(req,async c=>{
    await setRlsContext(c,{tenant_id:req.auth.tenant_id,outlet_id:req.auth.outlet_id,actor_staff_id:req.auth.staff_id,role_code:req.auth.role_code,pending_staff_id:staffId,capabilities:['tenant_scope','staff_admin']});
    const a=(await c.query('INSERT INTO staff_accounts(id,email,phone,display_name,pin_hash,nfc_credential_hash,status) VALUES($1,$2,$3,$4,$5,$6,\'active\') RETURNING id,created_at',[staffId,email,phone,name,pinHash,nfcHash])).rows[0];
    const tm=(await c.query('INSERT INTO tenant_memberships(tenant_id,staff_id,role_code,status,is_active) VALUES($1,$2,$3,\'active\',true) RETURNING id',[req.auth.tenant_id,a.id,role])).rows[0];
    await c.query('INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code,status,is_active) VALUES($1,$2,$3,$4,\'active\',true)',[req.auth.tenant_id,req.auth.outlet_id,tm.id,role]);
    await writeAdminAudit(c,req,'staff.created',a.id,null,{name,role,status:'active',email,phone},{pinConfigured:true,nfcConfigured:Boolean(nfcHash)});
    return {
      id:a.id,
      staff:{
        id:a.id,
        display_name:name,
        email,
        phone,
        role_code:role,
        status:'active',
        is_active:true,
        has_pin:true,
        has_nfc:Boolean(nfcHash),
        created_at:a.created_at,
      },
    };
  });
  res.status(201).json({ok:true,...created});
}));
app.patch('/api/admin/staff/:staffId/pin',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const pin=String(req.body?.pin||'').trim();
  if(!/^\d{4,8}$/.test(pin))return res.status(400).json({error:'PIN baru harus terdiri dari 4–8 digit angka.'});

  // Guard: PIN yang sudah digunakan tidak boleh digunakan lagi
  const existingPins = await adminScoped(req, async c => {
    return c.query(`
      SELECT a.id, a.pin_hash 
      FROM staff_accounts a 
      JOIN tenant_memberships tm ON tm.staff_id=a.id 
      WHERE tm.tenant_id=$1 AND a.pin_hash IS NOT NULL
    `, [req.auth.tenant_id]);
  });
  for (const row of existingPins.rows) {
    if (await verifyCredential(pin, row.pin_hash)) {
      return res.status(400).json({
        error: row.id === req.params.staffId
          ? 'PIN baru tidak boleh sama dengan PIN saat ini.'
          : 'PIN ini sudah digunakan oleh akun lain. Gunakan kombinasi PIN yang berbeda.'
      });
    }
  }

  const pinHash=await hashCredential(pin);
  const result=await adminScoped(req,async c=>{
    const member=await c.query('SELECT tm.id,a.display_name FROM tenant_memberships tm JOIN staff_accounts a ON a.id=tm.staff_id WHERE tm.tenant_id=$1 AND tm.staff_id=$2 FOR UPDATE OF a',[req.auth.tenant_id,req.params.staffId]);
    if(!member.rowCount)return {status:404,error:'Staff tidak ditemukan pada tenant ini.'};
    await c.query('UPDATE staff_accounts SET pin_hash=$1,updated_at=now() WHERE id=$2',[pinHash,req.params.staffId]);
    await c.query('UPDATE staff_sessions SET revoked_at=now() WHERE tenant_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[req.auth.tenant_id,req.params.staffId]);
    await writeAdminAudit(c,req,'staff.pin_updated',req.params.staffId,null,{pinUpdated:true},{sessionsRevoked:true});
    return {status:200};
  });
  if(result.status!==200)return res.status(result.status).json({error:result.error});
  res.json({ok:true,id:req.params.staffId});
}));
app.patch('/api/admin/staff/:staffId/status',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const rawStatus=req.body?.status!==undefined?String(req.body.status).trim().toLowerCase():undefined;
  const rawIsActive=typeof req.body?.isActive==='boolean'?req.body.isActive:undefined;
  const allowedStatuses=['active','suspended','disabled','blocked','inactive'];
  if(rawStatus===undefined&&rawIsActive===undefined)return res.status(400).json({error:'Status akun wajib diisi (active / suspended / disabled).'});
  if(rawStatus!==undefined&&!allowedStatuses.includes(rawStatus))return res.status(400).json({error:'Status akun tidak valid.'});
  const nextActive=rawIsActive!==undefined?rawIsActive:rawStatus==='active';
  const nextAccountStatus=nextActive?'active':(rawStatus&&rawStatus!=='active'?rawStatus:'suspended');
  const nextMembershipStatus=nextActive?'active':'inactive';
  if(req.params.staffId===req.auth.staff_id&&!nextActive)return res.status(400).json({error:'Tidak dapat memblokir akun Owner yang sedang digunakan.'});
  const result=await adminScoped(req,async c=>{
    const current=await c.query(`SELECT tm.id AS tenant_membership_id,tm.role_code,tm.status AS membership_status,
      a.id,a.display_name,a.email,a.phone,a.status AS account_status,
      (a.pin_hash IS NOT NULL) AS has_pin,(a.nfc_credential_hash IS NOT NULL) AS has_nfc,a.created_at
      FROM tenant_memberships tm JOIN staff_accounts a ON a.id=tm.staff_id
      LEFT JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=$3
      WHERE tm.tenant_id=$1 AND tm.staff_id=$2 FOR UPDATE OF tm,a`,[req.auth.tenant_id,req.params.staffId,req.auth.outlet_id]);
    if(!current.rowCount)return {status:404,error:'Staff tidak ditemukan pada tenant/outlet ini.'};
    const old=current.rows[0];
    if(old.role_code==='owner'&&!nextActive){
      const owners=await c.query("SELECT count(*)::int AS count FROM tenant_memberships tm JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=$2 AND om.status='active' WHERE tm.tenant_id=$1 AND tm.role_code='owner' AND tm.status='active'",[req.auth.tenant_id,req.auth.outlet_id]);
      if(owners.rows[0].count<=1)return {status:409,error:'Tidak bisa memblokir satu-satunya Owner aktif di outlet.'};
    }
    await c.query('UPDATE staff_accounts SET status=$1,updated_at=now() WHERE id=$2',[nextAccountStatus,req.params.staffId]);
    await c.query('UPDATE tenant_memberships SET status=$1,is_active=$2 WHERE tenant_id=$3 AND staff_id=$4',[nextMembershipStatus,nextActive,req.auth.tenant_id,req.params.staffId]);
    await c.query('UPDATE outlet_memberships SET status=$1,is_active=$2 WHERE tenant_id=$3 AND outlet_id=$4 AND tenant_membership_id=$5',[nextMembershipStatus,nextActive,req.auth.tenant_id,req.auth.outlet_id,old.tenant_membership_id]);
    if(!nextActive){
      await c.query('UPDATE staff_sessions SET revoked_at=now() WHERE tenant_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[req.auth.tenant_id,req.params.staffId]);
    }
    await writeAdminAudit(c,req,'staff.status_updated',req.params.staffId,{status:old.account_status,isActive:old.account_status==='active'&&old.membership_status==='active'},{status:nextAccountStatus,isActive:nextActive},{sessionsRevoked:!nextActive});
    const updatedStaff={
      id:old.id,
      display_name:old.display_name,
      email:old.email,
      phone:old.phone,
      role_code:old.role_code,
      status:nextAccountStatus,
      is_active:nextActive,
      has_pin:old.has_pin,
      has_nfc:old.has_nfc,
      created_at:old.created_at,
    };
    return {status:200,body:{ok:true,id:old.id,status:nextAccountStatus,isActive:nextActive,staff:updatedStaff}};
  });
  if(result.status!==200)return res.status(result.status).json({error:result.error});
  res.json(result.body);
}));
app.patch('/api/admin/staff/:staffId',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const role=req.body?.role,status=req.body?.status;
  if((role!==undefined&&!ADMIN_ROLES.includes(role))||(status!==undefined&&!['active','inactive','suspended','disabled','blocked'].includes(status))||(role===undefined&&status===undefined))return res.status(400).json({error:'Role atau status tidak valid.'});
  if(req.params.staffId===req.auth.staff_id&&status&&status!=='active')return res.status(400).json({error:'Owner tidak dapat menonaktifkan akun sendiri.'});
  if(req.params.staffId===req.auth.staff_id&&role&&role!=='owner')return res.status(400).json({error:'Owner tidak dapat menurunkan role akunnya sendiri.'});
  const result=await adminScoped(req,async c=>{
    const current=await c.query('SELECT tm.id,tm.role_code,a.status FROM tenant_memberships tm JOIN staff_accounts a ON a.id=tm.staff_id JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=$3 WHERE tm.tenant_id=$1 AND tm.staff_id=$2 FOR UPDATE OF tm,a',[req.auth.tenant_id,req.params.staffId,req.auth.outlet_id]);
    if(!current.rowCount)return {status:404,error:'Staff tidak ditemukan di outlet ini.'};
    const tenantCount=await c.query('SELECT count(DISTINCT tenant_id)::int AS count FROM tenant_memberships WHERE staff_id=$1',[req.params.staffId]);
    if(tenantCount.rows[0].count>1&&status!==undefined)return {status:409,error:'Akun ini terhubung ke beberapa tenant; perubahan status akun global harus melalui administrasi pusat.'};
    const old=current.rows[0],nextRole=role||old.role_code,nextStatus=status||old.status;
    if(old.role_code==='owner'&&(nextRole!=='owner'||nextStatus!=='active')){
      const owners=await c.query("SELECT count(*)::int AS count FROM tenant_memberships tm JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=$2 AND om.status='active' WHERE tm.tenant_id=$1 AND tm.role_code='owner' AND tm.status='active'",[req.auth.tenant_id,req.auth.outlet_id]);
      if(owners.rows[0].count<=1)return {status:409,error:'Tidak bisa menurunkan/nonaktifkan satu-satunya Owner aktif di outlet.'};
    }
    if(role!==undefined){await c.query('UPDATE tenant_memberships SET role_code=$1 WHERE id=$2',[role,old.id]);await c.query('UPDATE outlet_memberships SET role_code=$1 WHERE tenant_id=$2 AND outlet_id=$3 AND tenant_membership_id=$4',[role,req.auth.tenant_id,req.auth.outlet_id,old.id]);}
    if(status!==undefined){
      const nextActive=status==='active';
      const nextMembershipStatus=nextActive?'active':'inactive';
      await c.query('UPDATE staff_accounts SET status=$1,updated_at=now() WHERE id=$2',[status,req.params.staffId]);
      await c.query('UPDATE tenant_memberships SET status=$1,is_active=$2 WHERE id=$3',[nextMembershipStatus,nextActive,old.id]);
      await c.query('UPDATE outlet_memberships SET status=$1,is_active=$2 WHERE tenant_id=$3 AND outlet_id=$4 AND tenant_membership_id=$5',[nextMembershipStatus,nextActive,req.auth.tenant_id,req.auth.outlet_id,old.id]);
      if(!nextActive)await c.query('UPDATE staff_sessions SET revoked_at=now() WHERE tenant_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[req.auth.tenant_id,req.params.staffId]);
    }
    await writeAdminAudit(c,req,'staff.updated',req.params.staffId,{role:old.role_code,status:old.status},{role:nextRole,status:nextStatus});
    return {status:200};
  });
  if(result.status!==200)return res.status(result.status).json({error:result.error});
  res.json({ok:true});
}));
app.post('/api/admin/staff/:staffId/credentials',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const pin=req.body?.pin===undefined?null:String(req.body.pin).trim(),uid=req.body?.nfcUid===undefined?null:String(req.body.nfcUid).trim().toUpperCase(),clearNfc=req.body?.clearNfc===true;
  if(pin===null&&uid===null&&!clearNfc)return res.status(400).json({error:'PIN baru atau NFC UID wajib diisi.'});
  if(pin!==null&&!/^\d{4,8}$/.test(pin))return res.status(400).json({error:'PIN harus 4–8 digit.'});
  if(uid!==null&&(!uid||uid.length>200))return res.status(400).json({error:'NFC UID tidak valid.'});

  if (pin !== null) {
    const existingPins = await adminScoped(req, async c => {
      return c.query(`
        SELECT a.id, a.pin_hash 
        FROM staff_accounts a 
        JOIN tenant_memberships tm ON tm.staff_id=a.id 
        WHERE tm.tenant_id=$1 AND a.pin_hash IS NOT NULL
      `, [req.auth.tenant_id]);
    });
    for (const row of existingPins.rows) {
      if (await verifyCredential(pin, row.pin_hash)) {
        return res.status(400).json({
          error: row.id === req.params.staffId
            ? 'PIN baru tidak boleh sama dengan PIN saat ini.'
            : 'PIN ini sudah digunakan oleh akun lain. Gunakan kombinasi PIN yang berbeda.'
        });
      }
    }
  }

  const pinHash=pin===null?null:await hashCredential(pin),nfcHash=uid===null?null:await hashCredential(uid);
  const result=await adminScoped(req,async c=>{
    const member=await c.query('SELECT tm.id FROM tenant_memberships tm JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id WHERE tm.tenant_id=$1 AND tm.staff_id=$2 AND om.outlet_id=$3',[req.auth.tenant_id,req.params.staffId,req.auth.outlet_id]);
    if(!member.rowCount)return false;
    const tenantCount=await c.query('SELECT count(DISTINCT tenant_id)::int AS count FROM tenant_memberships WHERE staff_id=$1',[req.params.staffId]);
    if(tenantCount.rows[0].count>1)return 'multi';
    const sets=['updated_at=now()'],values=[req.params.staffId];
    if(pinHash){values.push(pinHash);sets.push('pin_hash=$'+values.length);}
    if(nfcHash){values.push(nfcHash);sets.push('nfc_credential_hash=$'+values.length);}
    if(clearNfc)sets.push('nfc_credential_hash=NULL');
    await c.query('UPDATE staff_accounts SET '+sets.join(',')+' WHERE id=$1',values);
    await c.query('UPDATE staff_sessions SET revoked_at=now() WHERE tenant_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[req.auth.tenant_id,req.params.staffId]);
    await writeAdminAudit(c,req,'staff.credentials_updated',req.params.staffId,null,null,{pinChanged:!!pinHash,nfcChanged:!!nfcHash,nfcRevoked:clearNfc,sessionsRevoked:true});
    return true;
  });
  if(result==='multi')return res.status(409).json({error:'Akun ini terhubung ke beberapa tenant; reset credential global harus melalui administrasi pusat.'});
  if(!result)return res.status(404).json({error:'Staff tidak ditemukan di outlet ini.'});
  res.json({ok:true,credentialsUpdated:true,sessionsRevoked:true});
}));
app.get('/api/menu', authenticate, requireKdsOrPosRole, asyncRoute(async (req,res) => {
  const rows = await scoped(req, c => c.query(`SELECT m.id,m.sku,m.name,m.description,m.destination,m.price,m.cost_price,m.image_url,m.category_id,c.name AS category_name,
      COALESCE(ms.track_stock,false) AS track_stock,ms.quantity AS stock_quantity
    FROM menu_items m LEFT JOIN menu_categories c ON c.tenant_id=m.tenant_id AND c.id=m.category_id
    LEFT JOIN menu_stock ms ON ms.tenant_id=m.tenant_id AND ms.outlet_id=$2 AND ms.menu_item_id=m.id
    WHERE m.tenant_id=$1 AND (m.outlet_id IS NULL OR m.outlet_id=$2) AND m.is_available=true
    ORDER BY c.sort_order NULLS LAST,m.sort_order,m.name`,[req.auth.tenant_id,req.auth.outlet_id]));
  res.json(rows.rows);
}));
app.put('/api/menu/:menuItemId/stock', authenticate, requireManagerOrOwner, asyncRoute(async(req,res)=>{
  const quantity=req.body?.quantity,trackStock=req.body?.trackStock!==false;
  if(!Number.isInteger(quantity)||quantity<0||quantity>1000000||typeof req.body?.trackStock!=='boolean') return res.status(400).json({error:'quantity integer 0–1.000.000 dan trackStock boolean wajib valid.'});
  const result=await scoped(req,async c=>{
    const menu=await c.query('SELECT id FROM menu_items WHERE tenant_id=$1 AND (outlet_id IS NULL OR outlet_id=$2) AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,req.params.menuItemId]);
    if(!menu.rowCount) return {status:404,body:{error:'Menu tidak ditemukan di outlet ini.'}};
    const old=await c.query('SELECT quantity,track_stock FROM menu_stock WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,req.params.menuItemId]);
    const nextQuantity=trackStock?quantity:0;
    const priorQuantity=old.rowCount&&old.rows[0].track_stock?Number(old.rows[0].quantity):0;
    const saved=(await c.query(`INSERT INTO menu_stock(tenant_id,outlet_id,menu_item_id,quantity,track_stock,updated_at,updated_by_staff_id)
      VALUES($1,$2,$3,$4,$5,now(),$6)
      ON CONFLICT(tenant_id,outlet_id,menu_item_id) DO UPDATE SET quantity=EXCLUDED.quantity,track_stock=EXCLUDED.track_stock,updated_at=now(),updated_by_staff_id=EXCLUDED.updated_by_staff_id
      RETURNING *`,[req.auth.tenant_id,req.auth.outlet_id,req.params.menuItemId,nextQuantity,trackStock,req.auth.staff_id])).rows[0];
    const delta=nextQuantity-priorQuantity;
    if(delta!==0) await c.query(`INSERT INTO menu_stock_movements(tenant_id,outlet_id,menu_item_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by_staff_id)
      VALUES($1,$2,$3,$4,$5,'stock_adjustment',$6,$7,$8)`,
      [req.auth.tenant_id,req.auth.outlet_id,req.params.menuItemId,old.rowCount?'adjustment':'opening',delta,randomUUID(),req.body?.note?String(req.body.note).slice(0,500):'Manager stock adjustment',req.auth.staff_id]);
    await c.query("INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'menu_stock.adjusted','menu_stock',$4,$5::jsonb)",
      [req.auth.tenant_id,req.auth.outlet_id,req.auth.staff_id,req.params.menuItemId,JSON.stringify({quantity:saved.quantity,trackStock:saved.track_stock,delta})]);
    return {status:200,body:saved};
  });
  res.status(result.status).json(result.body);
}));

app.get('/api/sessions', authenticate, requireKdsOrPosRole, asyncRoute(async (req,res) => {
  const rows = await scoped(req, c => c.query(`SELECT s.*,t.table_code,t.display_name AS table_name
    FROM dining_sessions s JOIN dining_tables t ON t.tenant_id=s.tenant_id AND t.outlet_id=s.outlet_id AND t.id=s.table_id
    WHERE s.tenant_id=$1 AND s.outlet_id=$2 AND s.status IN ('active','billing')
    ORDER BY s.opened_at DESC`,[req.auth.tenant_id,req.auth.outlet_id]));
  res.json(rows.rows);
}));
app.post('/api/sessions', authenticate, requirePosRole, asyncRoute(async (req,res) => {
  const { tableId, guestCount=1, waiterStaffId } = req.body || {};
  if (!tableId || !Number.isInteger(guestCount) || guestCount<1 || guestCount>100) return res.status(400).json({error:'tableId dan guestCount (1–100) wajib valid.'});
  const result = await scoped(req, async c => {
    if (waiterStaffId) {
      const waiter = await c.query(`SELECT 1 FROM tenant_memberships tm JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id
        WHERE tm.staff_id=$1 AND tm.tenant_id=$2 AND tm.status='active' AND om.outlet_id=$3 AND om.status='active' LIMIT 1`,
        [waiterStaffId,req.auth.tenant_id,req.auth.outlet_id]);
      if (!waiter.rowCount) return {status:400,body:{error:'Waiter tidak terdaftar pada outlet aktif ini.'}};
    }
    const isUuid = typeof tableId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
    const table = isUuid
      ? await c.query('SELECT id,capacity FROM dining_tables WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 AND is_active FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,tableId])
      : await c.query('SELECT id,capacity FROM dining_tables WHERE tenant_id=$1 AND outlet_id=$2 AND (table_code=$3 OR display_name=$3 OR id::text=$3) AND is_active FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,String(tableId).trim()]);
    if (!table.rowCount) return {status:404,body:{error:'Meja tidak ditemukan atau nonaktif.'}};
    const resolvedTableId = table.rows[0].id;
    if (guestCount>table.rows[0].capacity) return {status:400,body:{error:'Jumlah tamu melebihi kapasitas meja.'}};
    const active = await c.query("SELECT id FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND table_id=$3 AND status IN ('active','billing')",[req.auth.tenant_id,req.auth.outlet_id,resolvedTableId]);
    if (active.rowCount) return {status:409,body:{error:'Meja sedang digunakan.',sessionId:active.rows[0].id}};
    const settings = await c.query('SELECT COALESCE(os.service_charge_rate,ts.service_charge_rate,0) AS service_rate,COALESCE(os.tax_rate,ts.tax_rate,0) AS tax_rate,ts.default_payment_flow FROM tenant_settings ts LEFT JOIN outlet_settings os ON os.tenant_id=ts.tenant_id AND os.outlet_id=$2 WHERE ts.tenant_id=$1',[req.auth.tenant_id,req.auth.outlet_id]);
    const flow=settings.rows[0] || {service_rate:0,tax_rate:0,default_payment_flow:'payment_last'};
    const row = await c.query(`INSERT INTO dining_sessions(tenant_id,outlet_id,table_id,session_number,guest_count,opened_by_staff_id,waiter_staff_id,payment_flow,service_charge_rate,tax_rate)
      VALUES($1,$2,$3,'S-'||to_char(now(),'YYMMDDHH24MISSMS')||'-'||substr(gen_random_uuid()::text,1,6),$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.auth.tenant_id,req.auth.outlet_id,resolvedTableId,guestCount,req.auth.staff_id,waiterStaffId||req.auth.staff_id,flow.default_payment_flow,flow.service_rate,flow.tax_rate]);
    return {status:201,body:row.rows[0]};
  });
  res.status(result.status).json(result.body);
}));
app.get('/api/sessions/:sessionId/orders', authenticate, requireKdsOrPosRole, asyncRoute(async (req,res) => {
  const rows = await scoped(req, c => c.query(`SELECT b.id AS batch_id,b.batch_number,b.status AS batch_status,b.note,b.created_at,
    oi.id,oi.menu_item_id,oi.item_name_snapshot,oi.category_snapshot,oi.destination,oi.unit_price,oi.quantity,oi.modifier_total,oi.line_total,oi.notes,oi.cooking_status,oi.is_served,oi.served_at
    FROM order_batches b LEFT JOIN order_items oi ON oi.tenant_id=b.tenant_id AND oi.outlet_id=b.outlet_id AND oi.batch_id=b.id
    WHERE b.tenant_id=$1 AND b.outlet_id=$2 AND b.session_id=$3 ORDER BY b.batch_number,oi.created_at`,
    [req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]));
  res.json(rows.rows);
}));

app.patch('/api/sessions/:sessionId/orders/:itemId', authenticate, requireKdsOrPosRole, asyncRoute(async (req,res) => {
  const { cookingStatus, isServed } = req.body || {};
  const allowedStatuses = ['queue','cooking','ready','handed_off'];
  if ((cookingStatus !== undefined && !allowedStatuses.includes(cookingStatus)) ||
      (isServed !== undefined && typeof isServed !== 'boolean') ||
      (cookingStatus === undefined && isServed === undefined)) {
    return res.status(400).json({ error:'Status pesanan tidak valid.' });
  }
  const updated = await scoped(req, async c => {
    const session = await c.query(
      "SELECT id FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 AND status IN ('active','billing') FOR UPDATE",
      [req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]
    );
    if (!session.rowCount) return null;
    const result = await c.query(`UPDATE order_items
      SET cooking_status=COALESCE($5,cooking_status),
          is_served=COALESCE($6,is_served),
          served_at=CASE WHEN $6 IS TRUE THEN COALESCE(served_at,now()) WHEN $6 IS FALSE THEN NULL ELSE served_at END
      WHERE tenant_id=$1 AND outlet_id=$2 AND session_id=$3 AND id=$4
      RETURNING id,cooking_status,is_served,served_at`,
      [req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId,req.params.itemId,cookingStatus ?? null,isServed ?? null]
    );
    return result.rows[0] || null;
  });
  if (!updated) return res.status(404).json({ error:'Sesi atau item pesanan tidak ditemukan.' });
  res.json(updated);
}));
app.post('/api/sessions/:sessionId/orders', authenticate, requirePosRole, asyncRoute(async (req,res) => {
  const { items, note, idempotencyKey } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length>100) return res.status(400).json({error:'items harus berisi 1–100 item.'});
  if (typeof idempotencyKey!=='string' || idempotencyKey.length<8 || idempotencyKey.length>128) return res.status(400).json({error:'idempotencyKey 8–128 karakter wajib diisi.'});
  for (const item of items) if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>999) return res.status(400).json({error:'Setiap item memerlukan menuItemId dan quantity 1–999.'});
  const result = await scoped(req, async c => {
    const idemScope = 'order:'+req.auth.tenant_id+':'+req.auth.outlet_id+':'+idempotencyKey;
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[idemScope]);
    const existing = await c.query('SELECT operation,response_status,response_body,expires_at FROM idempotency_keys WHERE tenant_id=$1 AND outlet_id=$2 AND key=$3',[req.auth.tenant_id,req.auth.outlet_id,idempotencyKey]);
    if (existing.rowCount && new Date(existing.rows[0].expires_at)>new Date()) {
      if (existing.rows[0].operation!=='create_order') return {status:409,body:{error:'Idempotency key sudah digunakan untuk operasi berbeda.'}};
      if (existing.rows[0].response_body) {
        const priorSessionId=existing.rows[0].response_body?.batch?.session_id;
        if (priorSessionId!==req.params.sessionId) return {status:409,body:{error:'Idempotency key sudah terikat ke sesi meja lain.'}};
        return {status:200,body:existing.rows[0].response_body};
      }
      return {status:409,body:{error:'Permintaan dengan idempotency key ini sedang diproses.'}};
    }
    const session = await c.query("SELECT id FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 AND status='active' FOR UPDATE",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    if (!session.rowCount) return {status:404,body:{error:'Sesi meja tidak aktif atau tidak ditemukan.'}};
    const menuIds=[...new Set(items.map(i=>i.menuItemId))];
    const catalog = await c.query(`SELECT m.id,m.name,m.destination,m.price,c.name AS category_name
      FROM menu_items m LEFT JOIN menu_categories c ON c.tenant_id=m.tenant_id AND c.id=m.category_id
      WHERE m.tenant_id=$1 AND (m.outlet_id IS NULL OR m.outlet_id=$2) AND m.is_available AND m.id=ANY($3::uuid[])`,
      [req.auth.tenant_id,req.auth.outlet_id,menuIds]);
    if (catalog.rowCount !== menuIds.length) return {status:400,body:{error:'Satu atau lebih menu tidak tersedia.'}};
    const byId=new Map(catalog.rows.map(x=>[x.id,x]));
    const required=new Map();
    for (const item of items) required.set(item.menuItemId,(required.get(item.menuItemId)||0)+item.quantity);
    const stockRows=await c.query('SELECT menu_item_id,quantity,track_stock FROM menu_stock WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=ANY($3::uuid[]) ORDER BY menu_item_id FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,menuIds]);
    const stockByMenu=new Map(stockRows.rows.map(x=>[x.menu_item_id,x]));
    for (const [menuId,qty] of required) {
      const stock=stockByMenu.get(menuId);
      if (stock?.track_stock && Number(stock.quantity)<qty) {
        const availableStock=Number(stock.quantity);
        return {
          status:409,
          body:{
            error:'Stok menu tidak mencukupi.',
            code:'STOCK_UNAVAILABLE',
            legacyCode:'INSUFFICIENT_MENU_STOCK',
            menuItemId:menuId,
            available:availableStock,
            availableStock,
            requested:qty,
          },
        };
      }
    }
    const next = await c.query('SELECT COALESCE(MAX(batch_number),0)+1 AS n FROM order_batches WHERE tenant_id=$1 AND outlet_id=$2 AND session_id=$3',[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    const batch = (await c.query(`INSERT INTO order_batches(tenant_id,outlet_id,session_id,batch_number,created_by_staff_id,status,note,submitted_at)
      VALUES($1,$2,$3,$4,$5,'submitted',$6,now()) RETURNING *`,[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId,next.rows[0].n,req.auth.staff_id,note||null])).rows[0];
    const created=[];
    for (const item of items) {
      const m=byId.get(item.menuItemId), unit=Number(m.price), qty=item.quantity, line=unit*qty;
      if (!Number.isFinite(line)) throw new Error('Nilai pesanan tidak valid.');
      const row=await c.query(`INSERT INTO order_items(tenant_id,outlet_id,session_id,batch_id,menu_item_id,item_name_snapshot,category_snapshot,destination,unit_price,quantity,modifier_total,line_total,notes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12) RETURNING *`,
        [req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId,batch.id,m.id,m.name,m.category_name,m.destination,unit,qty,line,item.notes||null]);
      created.push(row.rows[0]);
      const stock=stockByMenu.get(m.id);
      if (stock?.track_stock) {
        await c.query('UPDATE menu_stock SET quantity=quantity-$1,updated_at=now(),updated_by_staff_id=$2 WHERE tenant_id=$3 AND outlet_id=$4 AND menu_item_id=$5',[qty,req.auth.staff_id,req.auth.tenant_id,req.auth.outlet_id,m.id]);
        await c.query(`INSERT INTO menu_stock_movements(tenant_id,outlet_id,menu_item_id,order_item_id,movement_type,quantity_delta,reference_type,reference_id,created_by_staff_id)
          VALUES($1,$2,$3,$4,'sale',$5,'order_item',$4,$6)`,
          [req.auth.tenant_id,req.auth.outlet_id,m.id,row.rows[0].id,-qty,req.auth.staff_id]);
      }
    }
    await c.query('UPDATE dining_sessions SET version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3',[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    const body={batch,items:created};
    await c.query(`INSERT INTO idempotency_keys(tenant_id,outlet_id,key,operation,response_status,response_body,expires_at)
      VALUES($1,$2,$3,'create_order',201,$4::jsonb,now()+interval '24 hours')
      ON CONFLICT(tenant_id,outlet_id,key) DO UPDATE SET operation=EXCLUDED.operation,response_status=EXCLUDED.response_status,response_body=EXCLUDED.response_body,created_at=now(),expires_at=EXCLUDED.expires_at
      WHERE idempotency_keys.expires_at<=now()`,
      [req.auth.tenant_id,req.auth.outlet_id,idempotencyKey,JSON.stringify(body)]);
    return {status:201,body};
  });
  res.status(result.status).json(result.body);
}));

app.post('/api/sessions/:sessionId/payments', authenticate, requirePosRole, asyncRoute(async (req,res) => {
  const { method, discountAmount=0, cashReceived, idempotencyKey, cardBank, managerApprovedId, managerApprovedName } = req.body || {};
  if (!['cash','qris','card','transfer','other'].includes(method) || typeof idempotencyKey!=='string' || idempotencyKey.length<8 || idempotencyKey.length>128 || !Number.isFinite(Number(discountAmount)) || Number(discountAmount)<0) return res.status(400).json({error:'Metode, idempotencyKey (8–128 karakter), atau diskon tidak valid.'});
  const result=await scoped(req,async c=>{
    const idemScope='payment:'+req.auth.tenant_id+':'+req.auth.outlet_id+':'+idempotencyKey;
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[idemScope]);
    const session=await c.query('SELECT * FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    if(!session.rowCount) return {status:404,body:{error:'Sesi meja tidak ditemukan.'}};
    const existing=await c.query('SELECT * FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND idempotency_key=$3',[req.auth.tenant_id,req.auth.outlet_id,idempotencyKey]);
    if(existing.rowCount) {
      const prior=existing.rows[0];
      const sameRequest=prior.session_id===req.params.sessionId && prior.method===method &&
        Number(prior.discount_amount)===Number(discountAmount) &&
        (method!=='cash'||Number(prior.cash_received)===Number(cashReceived)) &&
        (prior.card_bank||null)===(cardBank||null);
      if(!sameRequest) return {status:409,body:{error:'Idempotency key sudah digunakan untuk payload pembayaran yang berbeda.'}};
      if(prior.status==='voided') return {status:409,body:{error:'Pembayaran dengan idempotency key ini sudah di-void. Gunakan key baru untuk percobaan pembayaran berikutnya.',code:'PAYMENT_KEY_ALREADY_VOIDED'}};
      return {status:200,body:prior};
    }
    if(!['active','billing'].includes(session.rows[0].status)) return {status:409,body:{error:'Sesi sudah ditutup dan tidak menerima pembayaran baru.'}};
    const pending=await c.query("SELECT id FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND session_id=$3 AND status='pending' FOR UPDATE",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    if(pending.rowCount) return {status:409,body:{error:'Sudah ada pembayaran pending untuk sesi ini. Selesaikan atau void pembayaran tersebut terlebih dahulu.',pendingPaymentId:pending.rows[0].id}};
    const items=await c.query("SELECT id,line_total FROM order_items WHERE tenant_id=$1 AND outlet_id=$2 AND session_id=$3 AND cooking_status<>'cancelled' ORDER BY created_at FOR UPDATE",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    if(!items.rowCount) return {status:400,body:{error:'Tidak ada item pesanan yang dapat dibayar.'}};
    const subtotal=items.rows.reduce((sum,x)=>sum+Number(x.line_total),0),discount=Number(discountAmount);
    if(discount>subtotal) return {status:400,body:{error:'Diskon melebihi subtotal.'}};
    const service=Number(((subtotal-discount)*Number(session.rows[0].service_charge_rate)).toFixed(2));
    const tax=Number((((subtotal-discount)+service)*Number(session.rows[0].tax_rate)).toFixed(2));
    const total=Number((subtotal-discount+service+tax).toFixed(2));
    const received=method==='cash'?Number(cashReceived):total;
    if(!Number.isFinite(received)||received<total) return {status:400,body:{error:'Uang diterima tidak cukup.'}};
    const receipt='R-'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)+'-'+randomBytes(3).toString('hex').toUpperCase();
    const isInstantSettle = method === 'cash' || (method === 'qris' && Boolean(managerApprovedId));
    const status = isInstantSettle ? 'settled' : 'pending';
    const paidAt = status === 'settled' ? new Date() : null;
    const settledAt = status === 'settled' ? new Date() : null;
    const settledByStaffId = status === 'settled' ? req.auth.staff_id : null;
    const payment = (
      await c.query(
        `INSERT INTO payments(
          tenant_id, outlet_id, session_id, receipt_number, status, method, card_bank,
          subtotal_amount, discount_amount, service_charge_amount, tax_amount, total_amount,
          cash_received, change_amount, cashier_staff_id, idempotency_key, paid_at, settled_at, settled_by_staff_id
        ) VALUES (
          $1, $2, $3, $4, $5::text, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19
        ) RETURNING *`,
        [
          req.auth.tenant_id,
          req.auth.outlet_id,
          req.params.sessionId,
          receipt,
          status,
          method,
          cardBank || null,
          subtotal,
          discount,
          service,
          tax,
          total,
          received,
          method === 'cash' ? received - total : 0,
          req.auth.staff_id,
          idempotencyKey,
          paidAt,
          settledAt,
          settledByStaffId,
        ]
      )
    ).rows[0];

    if (managerApprovedId && status === 'settled') {
      await c.query(
        "UPDATE payments SET provider_reference = $1, settlement_note = $2, settled_by_staff_id = $3 WHERE id = $4",
        ['QRIS-MGR-APPROVED', 'Disetujui oleh Manager: ' + (managerApprovedName || 'Manager'), managerApprovedId, payment.id]
      );
    }
    if(status==='settled') {
      for(const item of items.rows) if(Number(item.line_total)>0) await c.query('INSERT INTO payment_allocations(tenant_id,outlet_id,payment_id,order_item_id,amount) VALUES($1,$2,$3,$4,$5)',[req.auth.tenant_id,req.auth.outlet_id,payment.id,item.id,Number(item.line_total)]);
      await c.query("UPDATE dining_sessions SET status='closed',closed_at=now(),version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    } else {
      await c.query("UPDATE dining_sessions SET status='billing',version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    }
    return {status:201,body:payment};
  });
  res.status(result.status).json(result.body);
}));

app.patch('/api/order-batches/:batchId/cancel', authenticate, requireManagerOrOwner, asyncRoute(async(req,res)=>{
  const result=await scoped(req,async c=>{
    const batchRef=await c.query('SELECT session_id FROM order_batches WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3',[req.auth.tenant_id,req.auth.outlet_id,req.params.batchId]);
    if(!batchRef.rowCount) return {status:404,body:{error:'Batch pesanan tidak ditemukan.'}};
    const session=await c.query('SELECT id,status FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,batchRef.rows[0].session_id]);
    const batch=await c.query('SELECT * FROM order_batches WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,req.params.batchId]);
    if(batch.rows[0].status==='voided') return {status:200,body:{ok:true,alreadyCancelled:true,batchId:req.params.batchId}};
    if(!session.rowCount||!['active','billing'].includes(session.rows[0].status)) return {status:409,body:{error:'Sesi sudah ditutup; pembatalan batch tidak diperbolehkan.'}};
    const pending=await c.query("SELECT id FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND session_id=$3 AND status='pending' LIMIT 1",[req.auth.tenant_id,req.auth.outlet_id,session.rows[0].id]);
    if(pending.rowCount) return {status:409,body:{error:'Pembayaran masih pending. Void pembayaran terlebih dahulu sebelum membatalkan pesanan.',pendingPaymentId:pending.rows[0].id}};
    const items=await c.query("SELECT id,menu_item_id,quantity FROM order_items WHERE tenant_id=$1 AND outlet_id=$2 AND batch_id=$3 AND cooking_status<>'cancelled' ORDER BY menu_item_id,id FOR UPDATE",[req.auth.tenant_id,req.auth.outlet_id,req.params.batchId]);
    await c.query("UPDATE order_batches SET status='voided' WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3",[req.auth.tenant_id,req.auth.outlet_id,req.params.batchId]);
    for(const item of items.rows) {
      await c.query("UPDATE order_items SET cooking_status='cancelled' WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3",[req.auth.tenant_id,req.auth.outlet_id,item.id]);
      const stock=await c.query('SELECT track_stock FROM menu_stock WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,item.menu_item_id]);
      const sold=await c.query("SELECT 1 FROM menu_stock_movements WHERE tenant_id=$1 AND outlet_id=$2 AND reference_type='order_item' AND reference_id=$3 AND movement_type='sale'",[req.auth.tenant_id,req.auth.outlet_id,item.id]);
      if(stock.rowCount&&stock.rows[0].track_stock&&sold.rowCount) {
        await c.query('UPDATE menu_stock SET quantity=quantity+$1,updated_at=now(),updated_by_staff_id=$2 WHERE tenant_id=$3 AND outlet_id=$4 AND menu_item_id=$5',[item.quantity,req.auth.staff_id,req.auth.tenant_id,req.auth.outlet_id,item.menu_item_id]);
        await c.query(`INSERT INTO menu_stock_movements(tenant_id,outlet_id,menu_item_id,order_item_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by_staff_id)
          VALUES($1,$2,$3,$4,'return',$5,'order_item',$4,'Manager cancellation',$6)`,
          [req.auth.tenant_id,req.auth.outlet_id,item.menu_item_id,item.id,item.quantity,req.auth.staff_id]);
      }
    }
    await c.query("INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'order_batch.cancelled','order_batch',$4,$5::jsonb)",
      [req.auth.tenant_id,req.auth.outlet_id,req.auth.staff_id,req.params.batchId,JSON.stringify({restoredItems:items.rows.length})]);
    await c.query('UPDATE dining_sessions SET version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3',[req.auth.tenant_id,req.auth.outlet_id,session.rows[0].id]);
    return {status:200,body:{ok:true,batchId:req.params.batchId,cancelledItems:items.rows.length,stockRestored:true}};
  });
  res.status(result.status).json(result.body);
}));

app.patch('/api/order-items/:itemId/cancel', authenticate, requireManagerOrOwner, asyncRoute(async(req,res)=>{
  const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 500) : null;
  const result=await scoped(req,async c=>{
    const ref=await c.query('SELECT session_id FROM order_items WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3',[req.auth.tenant_id,req.auth.outlet_id,req.params.itemId]);
    if(!ref.rowCount) return {status:404,body:{error:'Item pesanan tidak ditemukan.'}};
    const session=await c.query('SELECT id,status FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,ref.rows[0].session_id]);
    const item=await c.query('SELECT * FROM order_items WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,req.params.itemId]);
    if(item.rows[0].cooking_status==='cancelled') return {status:200,body:{ok:true,alreadyCancelled:true,itemId:req.params.itemId}};
    if(!session.rowCount||!['active','billing'].includes(session.rows[0].status)) return {status:409,body:{error:'Sesi sudah ditutup; item tidak dapat dibatalkan.'}};
    if(item.rows[0].is_served||['cooking','ready','handed_off'].includes(item.rows[0].cooking_status)) return {status:409,body:{error:'Item sudah diproses atau disajikan; pembatalan ditolak.'}};
    const pending=await c.query("SELECT id FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND session_id=$3 AND status='pending' LIMIT 1",[req.auth.tenant_id,req.auth.outlet_id,session.rows[0].id]);
    if(pending.rowCount) return {status:409,body:{error:'Pembayaran masih pending. Void pembayaran terlebih dahulu.',pendingPaymentId:pending.rows[0].id}};
    await c.query("UPDATE order_items SET cooking_status='cancelled' WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3",[req.auth.tenant_id,req.auth.outlet_id,req.params.itemId]);
    let restored=false;
    const stock=await c.query('SELECT track_stock FROM menu_stock WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,item.rows[0].menu_item_id]);
    const sold=await c.query("SELECT 1 FROM menu_stock_movements WHERE tenant_id=$1 AND outlet_id=$2 AND reference_type='order_item' AND reference_id=$3 AND movement_type='sale'",[req.auth.tenant_id,req.auth.outlet_id,item.rows[0].id]);
    if(stock.rowCount&&stock.rows[0].track_stock&&sold.rowCount) {
      await c.query('UPDATE menu_stock SET quantity=quantity+$1,updated_at=now(),updated_by_staff_id=$2 WHERE tenant_id=$3 AND outlet_id=$4 AND menu_item_id=$5',[item.rows[0].quantity,req.auth.staff_id,req.auth.tenant_id,req.auth.outlet_id,item.rows[0].menu_item_id]);
      await c.query(`INSERT INTO menu_stock_movements(tenant_id,outlet_id,menu_item_id,order_item_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by_staff_id)
        VALUES($1,$2,$3,$4,'return',$5,'order_item',$4,$6,$7)`,
        [req.auth.tenant_id,req.auth.outlet_id,item.rows[0].menu_item_id,item.rows[0].id,item.rows[0].quantity,reason||'Manager item cancellation',req.auth.staff_id]);
      restored=true;
    }
    await c.query("INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'order_item.cancelled','order_item',$4,$5::jsonb)",
      [req.auth.tenant_id,req.auth.outlet_id,req.auth.staff_id,req.params.itemId,JSON.stringify({stockRestored:restored,quantity:item.rows[0].quantity,reason})]);
    await c.query('UPDATE dining_sessions SET version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3',[req.auth.tenant_id,req.auth.outlet_id,session.rows[0].id]);
    return {status:200,body:{ok:true,itemId:req.params.itemId,stockRestored:restored,reason}};
  });
  res.status(result.status).json(result.body);
}));

app.patch('/api/payments/:paymentId/void', authenticate, requireSettlementRole, asyncRoute(async(req,res)=>{
  const reason=String(req.body?.reason||'').trim();
  if(reason.length<3||reason.length>500) return res.status(400).json({error:'Alasan void 3–500 karakter wajib diisi.'});
  const result=await scoped(req,async c=>{
    const ref=await c.query('SELECT session_id FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3',[req.auth.tenant_id,req.auth.outlet_id,req.params.paymentId]);
    if(!ref.rowCount) return {status:404,body:{error:'Pembayaran tidak ditemukan.'}};
    const session=await c.query('SELECT id,status FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,ref.rows[0].session_id]);
    const payment=await c.query('SELECT * FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,req.params.paymentId]);
    if(payment.rows[0].status==='voided') return {status:200,body:{ok:true,alreadyVoided:true,payment:payment.rows[0]}};
    if(payment.rows[0].status!=='pending'||!session.rowCount||!['active','billing'].includes(session.rows[0].status)) return {status:409,body:{error:'Hanya pembayaran pending pada sesi yang belum ditutup dapat di-void.'}};
    const updated=(await c.query("UPDATE payments SET status='voided',settlement_note=$1 WHERE tenant_id=$2 AND outlet_id=$3 AND id=$4 RETURNING *",
      [reason,req.auth.tenant_id,req.auth.outlet_id,req.params.paymentId])).rows[0];
    await c.query("UPDATE dining_sessions SET status='active',version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3",[req.auth.tenant_id,req.auth.outlet_id,session.rows[0].id]);
    await c.query("INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'payment.voided','payment',$4,$5::jsonb)",
      [req.auth.tenant_id,req.auth.outlet_id,req.auth.staff_id,req.params.paymentId,JSON.stringify({reason,method:updated.method})]);
    return {status:200,body:{ok:true,payment:updated,sessionReopened:true}};
  });
  res.status(result.status).json(result.body);
}));

app.patch('/api/payments/:paymentId/settle', authenticate, requireSettlementRole, asyncRoute(async(req,res)=>{
  const providerReference=String(req.body?.providerReference||'').trim();
  const settlementNote=req.body?.note?String(req.body.note).trim():null;
  const result=await scoped(req,async c=>{
    const paymentRef=await c.query('SELECT session_id FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3',[req.auth.tenant_id,req.auth.outlet_id,req.params.paymentId]);
    if(!paymentRef.rowCount) return {status:404,body:{error:'Pembayaran tidak ditemukan.'}};
    const session=await c.query('SELECT id,status FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,paymentRef.rows[0].session_id]);
    const paymentRow=await c.query('SELECT * FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,req.params.paymentId]);
    const prior=paymentRow.rows[0];
    if(prior.status==='settled') {
      if(providerReference && prior.provider_reference && prior.provider_reference!==providerReference) return {status:409,body:{error:'Reference pembayaran berbeda dengan settlement yang sudah tercatat.'}};
      return {status:200,body:prior};
    }
    if(prior.status!=='pending'||!session.rowCount||!['active','billing'].includes(session.rows[0].status)) return {status:409,body:{error:'Pembayaran tidak lagi berstatus pending atau sesi sudah tidak aktif.'}};
    if(prior.method!=='cash'&&providerReference.length<3) return {status:400,body:{error:'providerReference wajib diisi untuk konfirmasi pembayaran non-tunai.'}};
    const updated=(await c.query(`UPDATE payments SET status='settled',paid_at=now(),settled_at=now(),settled_by_staff_id=$1,provider_reference=$2,settlement_note=$3
      WHERE tenant_id=$4 AND outlet_id=$5 AND id=$6 RETURNING *`,
      [req.auth.staff_id,providerReference||null,settlementNote,req.auth.tenant_id,req.auth.outlet_id,req.params.paymentId])).rows[0];
    const items=await c.query("SELECT id,line_total FROM order_items WHERE tenant_id=$1 AND outlet_id=$2 AND session_id=$3 AND cooking_status<>'cancelled' ORDER BY created_at FOR UPDATE",[req.auth.tenant_id,req.auth.outlet_id,session.rows[0].id]);
    for(const item of items.rows) if(Number(item.line_total)>0) await c.query('INSERT INTO payment_allocations(tenant_id,outlet_id,payment_id,order_item_id,amount) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,outlet_id,payment_id,order_item_id) DO NOTHING',[req.auth.tenant_id,req.auth.outlet_id,updated.id,item.id,Number(item.line_total)]);
    await c.query("UPDATE dining_sessions SET status='closed',closed_at=now(),version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3",[req.auth.tenant_id,req.auth.outlet_id,session.rows[0].id]);
    return {status:200,body:updated};
  });
  res.status(result.status).json(result.body);
}));

app.patch('/api/order-items/:itemId/kitchen-status', authenticate, requireKdsOrPosRole, asyncRoute(async (req,res) => {
  const allowed=['queue','cooking','ready','handed_off'];
  const status=req.body?.status;
  if (!allowed.includes(status)) return res.status(400).json({error:'Status KDS tidak valid.'});
  const row=await scoped(req,c=>c.query(`UPDATE order_items SET cooking_status=$1,is_served=CASE WHEN $1='handed_off' THEN true ELSE is_served END,served_at=CASE WHEN $1='handed_off' THEN now() ELSE served_at END
    WHERE tenant_id=$2 AND outlet_id=$3 AND id=$4 RETURNING *`,[status,req.auth.tenant_id,req.auth.outlet_id,req.params.itemId]));
  if (!row.rowCount) return res.status(404).json({error:'Item pesanan tidak ditemukan.'});
  res.json(row.rows[0]);
}));

// All outlet data endpoints set transaction-local RLS context after resolving the server-side session.
app.get('/api/tables', authenticate, requireKdsOrPosRole, asyncRoute(async (req,res) => {
  const rows = await transaction(async c => {
    await setRlsContext(c, { tenant_id: req.auth.tenant_id, outlet_id: req.auth.outlet_id, actor_staff_id: req.auth.staff_id, role_code: req.auth.role_code, capabilities: ['tenant_scope'] });
    return (await c.query('SELECT * FROM v_table_board WHERE tenant_id=$1 AND outlet_id=$2 ORDER BY table_code',[req.auth.tenant_id,req.auth.outlet_id])).rows;
  });
  res.json(rows);
}));

// Serve the Vite production build from the same origin as the API (Render preview).
const webDistPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
app.use(express.static(webDistPath, { index: false, fallthrough: true, maxAge: '1h' }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDistPath, 'index.html'), error => { if (error) next(error); });
});

app.use((err, _req, res, _next) => {
  console.error('[api]', err.message, err.stack);
  res.status(500).json({ error: err.message || 'Terjadi kesalahan server.', detail: err.detail || null });
});
async function assertSafeRuntimeRole() {
  const result = await pool.query(`
    SELECT r.rolsuper,r.rolbypassrls,r.rolinherit,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') AND c.relowner=r.oid) AS owns_public_objects,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner=r.oid) AS owns_public_schema,
      EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS has_role_memberships,
      has_schema_privilege(current_user,'public','CREATE') AS can_create_public_objects,
      has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schemas
    FROM pg_roles r WHERE r.rolname=current_user
  `);
  const role=result.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.owns_public_objects || role.owns_public_schema || role.has_role_memberships || role.can_create_public_objects || role.can_create_schemas) {
    throw new Error('Unsafe DATABASE_URL role. API requires a dedicated non-owner role with NOSUPERUSER, NOBYPASSRLS and no privileged role memberships. Neon-managed INHERIT is accepted only when no memberships exist.');
  }
}
let runtimeRoleCheckPromise = null;
function ensureSafeRuntimeRole() {
  if (!runtimeRoleCheckPromise) {
    runtimeRoleCheckPromise = assertSafeRuntimeRole().catch((err) => {
      runtimeRoleCheckPromise = null;
      throw err;
    });
  }
  return runtimeRoleCheckPromise;
}

if (!process.env.VERCEL) {
  await assertSafeRuntimeRole();
  const port=Number(process.env.PORT || 8080);
  const server=app.listen(port,'0.0.0.0',()=>console.log('Gastro-Cashier API listening on '+port));
  async function shutdown(){server.close();await pool.end();await bootstrapPool?.end();process.exit(0);}
  process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
}

export default app;
