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
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 10.');
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
const bootstrapPool = process.env.BOOTSTRAP_DATABASE_URL ? new Pool({ connectionString: process.env.BOOTSTRAP_DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined, max: 2, connectionTimeoutMillis: 5000 }) : null;
const scrypt = promisify(scryptCallback);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalizeRole = (role) => role === 'owner' ? 'owner' : role === 'finance' ? 'finance' : role === 'cashier' ? 'cashier' : null;
function requireOwner(req,res,next) { if (!req.auth || req.auth.role_code !== 'owner') return res.status(403).json({error:'Hanya Owner yang dapat mengelola staff.'}); next(); }
function requirePosRole(req, res, next) {
  if (!req.auth || !['owner','cashier'].includes(normalizeRole(req.auth.role_code))) {
    return res.status(403).json({ error:'Role Anda tidak memiliki izin untuk operasi POS.' });
  }
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
function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 5;
const AUTH_BLOCK_MS = 30 * 1000;
function authScopeHash(req) { return sha256(String(req.ip || req.socket?.remoteAddress || 'unknown')); }
async function consumeAuthAttempt(req) {
  const scopeHash = authScopeHash(req);
  return transaction(async c => {
    await c.query("SELECT set_config('app.auth_rate_limit','true',true)");
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
    await c.query("SELECT set_config('app.auth_rate_limit','true',true)");
    await c.query('UPDATE auth_rate_limits SET failed_attempts=0,window_started_at=now(),blocked_until=NULL,updated_at=now() WHERE scope_hash=$1', [authScopeHash(req)]);
  });
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  const r = await pool.query('SELECT current_setting($1) AS version', ['server_version']);
  res.json({ ok: true, database: 'postgresql', version: r.rows[0].version });
}));

// One-time tenant/outlet/staff provisioning. Keep BOOTSTRAP_TOKEN out of source control.
app.post('/api/bootstrap', asyncRoute(async (req, res) => {
  if (!process.env.BOOTSTRAP_TOKEN || req.get('x-bootstrap-token') !== process.env.BOOTSTRAP_TOKEN) return res.status(403).json({ error: 'Bootstrap tidak diizinkan.' });
  if (!bootstrapPool) return res.status(503).json({ error: 'Bootstrap nonaktif: BOOTSTRAP_DATABASE_URL belum dikonfigurasi.' });
  const { tenantName, tenantSlug, outletName, outletSlug, staffName, email, pin, nfcUid } = req.body || {};
  if (![tenantName,tenantSlug,outletName,outletSlug,staffName,pin].every(v => typeof v === 'string' && v.trim()) || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'Data tenant/outlet/staff wajib diisi; PIN 4–8 digit.' });
  const pinHash = await hashCredential(pin);
  const nfcHash = nfcUid ? await hashCredential(String(nfcUid).trim().toUpperCase()) : null;
  const created = await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('gastro_cashier_one_time_bootstrap'))");
    await c.query("SELECT set_config('app.bootstrap_mode','true',true)");
    if ((await c.query('SELECT 1 FROM tenants LIMIT 1')).rowCount) return { alreadyBootstrapped: true };
    const t = (await c.query('INSERT INTO tenants(slug,name) VALUES($1,$2) RETURNING id', [tenantSlug,tenantName])).rows[0];
    const o = (await c.query('INSERT INTO outlets(tenant_id,slug,name) VALUES($1,$2,$3) RETURNING id', [t.id,outletSlug,outletName])).rows[0];
    await c.query('INSERT INTO tenant_settings(tenant_id) VALUES($1)', [t.id]);
    const staff = (await c.query('INSERT INTO staff_accounts(email,display_name,pin_hash,nfc_credential_hash) VALUES($1,$2,$3,$4) RETURNING id', [email || null,staffName,pinHash,nfcHash])).rows[0];
    const membership = (await c.query("INSERT INTO tenant_memberships(tenant_id,staff_id,role_code) VALUES($1,$2,'owner') RETURNING id", [t.id,staff.id])).rows[0];
    await c.query("INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code) VALUES($1,$2,$3,'owner')", [t.id,o.id,membership.id]);
    return { tenantId:t.id,outletId:o.id,staffId:staff.id };
  }, bootstrapPool);
  if (created.alreadyBootstrapped) return res.status(409).json({ error:'Bootstrap sudah pernah diselesaikan. Endpoint ini hanya untuk provisioning awal.' });
  res.status(201).json({ ok:true,...created });
}));

async function authenticate(req, res, next) {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i,'');
    if (!token) return res.status(401).json({ error:'Sesi login diperlukan.' });
    const tokenHash = sha256(token);
    const auth = await transaction(async c => {
      await c.query("SELECT set_config('app.session_token_hash',$1,true)",[tokenHash]);
      const session = await c.query("SELECT staff_id,tenant_id,outlet_id FROM staff_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",[tokenHash]);
      if (!session.rowCount) return null;
      await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[session.rows[0].tenant_id,session.rows[0].outlet_id]);
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
    await c.query("SELECT set_config('app.auth_lookup','true',true)");
    const matches = await c.query(`SELECT a.id AS staff_id,a.display_name,tm.role_code,t.id AS tenant_id,t.name AS tenant_name,o.id AS outlet_id,o.name AS outlet_name,a.${credentialColumn} AS credential_hash
      FROM staff_accounts a JOIN tenant_memberships tm ON tm.staff_id=a.id AND tm.status='active'
      JOIN tenants t ON t.id=tm.tenant_id AND t.status='active'
      JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.status='active'
      JOIN outlets o ON o.id=om.outlet_id AND o.status='active'
      WHERE a.id=$1 AND a.status='active' ORDER BY t.created_at,o.created_at LIMIT 20`,[staffId]);
    const matched = [];
    for (const row of matches.rows) if (await verifyCredential(credential,row.credential_hash)) matched.push(row);
    if (!matched.length) return { error:'invalid' };
    if (matched.length > 1) return { error:'multiple' };
    if (!normalizeRole(matched[0].role_code)) return { error:'role' };
    const row = matched[0], token = randomBytes(32).toString('base64url');
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[row.tenant_id,row.outlet_id]);
    await c.query('INSERT INTO staff_sessions(staff_id,tenant_id,outlet_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+make_interval(hours => 12))',[row.staff_id,row.tenant_id,row.outlet_id,sha256(token)]);
    return { row, token };
  });
  if (issued.error === 'invalid') return res.status(401).json({ error:'Kredensial tidak valid atau akun tidak aktif.' });
  if (issued.error === 'multiple') return res.status(409).json({ error:'Staff memiliki lebih dari satu outlet. Endpoint pemilihan outlet perlu digunakan.' });
  if (issued.error === 'role') return res.status(403).json({ error:'Role staff belum dikenali. Hubungi administrator.' });
  const { row, token } = issued;
  res.json({ token, expiresIn:43200, staff:{ id:row.staff_id,name:row.display_name,role:normalizeRole(row.role_code),roleCode:row.role_code,tenantId:row.tenant_id,tenantName:row.tenant_name,outletId:row.outlet_id,outletName:row.outlet_name,pin:'',nfcTagUid:'',avatarColor:'bg-emerald-600',roleLabel:row.role_code } });
}

app.post('/api/auth/pin', asyncRoute(async (req,res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error:'PIN harus tepat 4 digit.' });
  const retryAfter = await consumeAuthAttempt(req);
  if (retryAfter) { res.set('Retry-After', String(retryAfter)); return res.status(429).json({ error:'Terlalu banyak percobaan autentikasi. Coba lagi nanti.' }); }
  const candidates = await transaction(async c => { await c.query("SELECT set_config('app.auth_lookup','true',true)"); return c.query("SELECT id,pin_hash FROM staff_accounts WHERE status='active' AND pin_hash IS NOT NULL"); });
  const found = [];
  for (const row of candidates.rows) if (await verifyCredential(pin,row.pin_hash)) found.push(row);
  if (found.length !== 1) return res.status(401).json({ error:'PIN tidak valid atau akun tidak aktif.' });
  await clearAuthAttempts(req);
  return issueSession(found[0].id,'pin_hash',pin,res);
}));
app.post('/api/auth/nfc', asyncRoute(async (req,res) => {
  const uid = String(req.body?.uid || '').trim().toUpperCase();
  if (!uid) return res.status(400).json({ error:'NFC UID wajib diisi.' });
  const retryAfter = await consumeAuthAttempt(req);
  if (retryAfter) { res.set('Retry-After', String(retryAfter)); return res.status(429).json({ error:'Terlalu banyak percobaan autentikasi. Coba lagi nanti.' }); }
  const candidates = await transaction(async c => { await c.query("SELECT set_config('app.auth_lookup','true',true)"); return c.query("SELECT id,nfc_credential_hash FROM staff_accounts WHERE status='active' AND nfc_credential_hash IS NOT NULL"); });
  const found = [];
  for (const row of candidates.rows) if (await verifyCredential(uid,row.nfc_credential_hash)) found.push(row);
  if (found.length !== 1) return res.status(401).json({ error:'Kartu NFC tidak dikenal atau tidak aktif.' });
  await clearAuthAttempts(req);
  return issueSession(found[0].id,'nfc_credential_hash',uid,res);
}));
app.post('/api/auth/logout', authenticate, asyncRoute(async (req,res) => {
  await transaction(async c => {
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true),set_config('app.session_token_hash',$3,true)",[req.auth.tenant_id,req.auth.outlet_id,req.tokenHash]);
    return c.query('UPDATE staff_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',[req.tokenHash]);
  });
  res.json({ ok:true });
}));
app.get('/api/me', authenticate, (req,res) => {
  const a=req.auth; res.json({ id:a.staff_id,name:a.display_name,role:normalizeRole(a.role_code),tenantId:a.tenant_id,tenantName:a.tenant_name,outletId:a.outlet_id,outletName:a.outlet_name });
});


// Shared request helper: every tenant-scoped query runs with transaction-local RLS context.
async function scoped(req, fn) {
  return transaction(async c => {
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true)",[req.auth.tenant_id,req.auth.outlet_id]);
    return fn(c);
  });
}

async function adminScoped(req,fn) {
  return transaction(async c=>{
    await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.outlet_id',$2,true),set_config('app.staff_admin','true',true),set_config('app.actor_staff_id',$3,true)",[req.auth.tenant_id,req.auth.outlet_id,req.auth.staff_id]);
    return fn(c);
  });
}
async function writeAdminAudit(c,req,action,staffId,beforeData,afterData,metadata={}) {
  await c.query('INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id,ip_address,user_agent,before_data,after_data,metadata) VALUES($1,$2,$3,$4,\'staff\',$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)',
    [req.auth.tenant_id,req.auth.outlet_id,req.auth.staff_id,action,staffId,req.ip||null,req.get('user-agent')||null,JSON.stringify(beforeData),JSON.stringify(afterData),JSON.stringify(metadata)]);
}
const ADMIN_ROLES=['owner','cashier','finance'];
app.get('/api/admin/staff',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const rows=await adminScoped(req,c=>c.query('SELECT a.id,a.display_name,a.email,a.phone,a.status,tm.role_code,(a.pin_hash IS NOT NULL) AS has_pin,(a.nfc_credential_hash IS NOT NULL) AS has_nfc,a.created_at FROM staff_accounts a JOIN tenant_memberships tm ON tm.staff_id=a.id AND tm.tenant_id=$1 JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id AND om.outlet_id=$2 WHERE (tm.status=\'active\' AND om.status=\'active\') OR a.status<>\'active\' ORDER BY a.display_name',[req.auth.tenant_id,req.auth.outlet_id]));
  res.json(rows.rows);
}));
app.post('/api/admin/staff',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const name=String(req.body?.name||'').trim(),email=req.body?.email?String(req.body.email).trim().toLowerCase():null,phone=req.body?.phone?String(req.body.phone).trim():null;
  const role=req.body?.role,pin=String(req.body?.pin||'');
  if(!name||name.length>120||!ADMIN_ROLES.includes(role)||!/^\d{4}$/.test(pin)||(!email&&!phone)||(email&&(email.length>254||!/^\S+@\S+\.\S+$/.test(email)))||(phone&&(phone.length>40||!/^\+?[0-9 ()-]{6,40}$/.test(phone))))return res.status(400).json({error:'Nama, kontak (email/telepon), role, atau PIN tidak valid.'});
  const pinHash=await hashCredential(pin);
  const created=await adminScoped(req,async c=>{
    const a=(await c.query('INSERT INTO staff_accounts(email,phone,display_name,pin_hash) VALUES($1,$2,$3,$4) RETURNING id',[email,phone,name,pinHash])).rows[0];
    const tm=(await c.query('INSERT INTO tenant_memberships(tenant_id,staff_id,role_code) VALUES($1,$2,$3) RETURNING id',[req.auth.tenant_id,a.id,role])).rows[0];
    await c.query('INSERT INTO outlet_memberships(tenant_id,outlet_id,tenant_membership_id,role_code) VALUES($1,$2,$3,$4)',[req.auth.tenant_id,req.auth.outlet_id,tm.id,role]);
    await writeAdminAudit(c,req,'staff.created',a.id,null,{name,role,status:'active'},{pinConfigured:true,nfcConfigured:false});
    return {id:a.id};
  });
  res.status(201).json({ok:true,...created});
}));
app.patch('/api/admin/staff/:staffId',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const role=req.body?.role,status=req.body?.status;
  if((role!==undefined&&!ADMIN_ROLES.includes(role))||(status!==undefined&&!['active','inactive'].includes(status))||(role===undefined&&status===undefined))return res.status(400).json({error:'Role atau status tidak valid.'});
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
    if(status!==undefined){await c.query('UPDATE staff_accounts SET status=$1 WHERE id=$2',[status,req.params.staffId]);await c.query('UPDATE tenant_memberships SET status=$1 WHERE id=$2',[status,old.id]);if(status!=='active')await c.query('UPDATE staff_sessions SET revoked_at=now() WHERE tenant_id=$1 AND staff_id=$2 AND revoked_at IS NULL',[req.auth.tenant_id,req.params.staffId]);}
    await writeAdminAudit(c,req,'staff.updated',req.params.staffId,{role:old.role_code,status:old.status},{role:nextRole,status:nextStatus});
    return {status:200};
  });
  if(result.status!==200)return res.status(result.status).json({error:result.error});
  res.json({ok:true});
}));
app.post('/api/admin/staff/:staffId/credentials',authenticate,requireOwner,asyncRoute(async(req,res)=>{
  const pin=req.body?.pin===undefined?null:String(req.body.pin),uid=req.body?.nfcUid===undefined?null:String(req.body.nfcUid).trim().toUpperCase(),clearNfc=req.body?.clearNfc===true;
  if(pin===null&&uid===null&&!clearNfc)return res.status(400).json({error:'PIN baru atau NFC UID wajib diisi.'});
  if(pin!==null&&!/^\d{4}$/.test(pin))return res.status(400).json({error:'PIN harus 4–8 digit.'});
  if(uid!==null&&(!uid||uid.length>200))return res.status(400).json({error:'NFC UID tidak valid.'});
  const pinHash=pin===null?null:await hashCredential(pin),nfcHash=uid===null?null:await hashCredential(uid);
  const result=await adminScoped(req,async c=>{
    const member=await c.query('SELECT tm.id FROM tenant_memberships tm JOIN outlet_memberships om ON om.tenant_id=tm.tenant_id AND om.tenant_membership_id=tm.id WHERE tm.tenant_id=$1 AND tm.staff_id=$2 AND om.outlet_id=$3',[req.auth.tenant_id,req.params.staffId,req.auth.outlet_id]);
    if(!member.rowCount)return false;
    const tenantCount=await c.query('SELECT count(DISTINCT tenant_id)::int AS count FROM tenant_memberships WHERE staff_id=$1',[req.params.staffId]);
    if(tenantCount.rows[0].count>1)return 'multi';
    const sets=[],values=[req.params.staffId];
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
app.get('/api/menu', authenticate, requirePosRole, asyncRoute(async (req,res) => {
  const rows = await scoped(req, c => c.query(`SELECT m.id,m.sku,m.name,m.description,m.destination,m.price,m.cost_price,m.image_url,m.category_id,c.name AS category_name
    FROM menu_items m LEFT JOIN menu_categories c ON c.tenant_id=m.tenant_id AND c.id=m.category_id
    WHERE m.tenant_id=$1 AND (m.outlet_id IS NULL OR m.outlet_id=$2) AND m.is_available=true
    ORDER BY c.sort_order NULLS LAST,m.sort_order,m.name`,[req.auth.tenant_id,req.auth.outlet_id]));
  res.json(rows.rows);
}));
app.get('/api/sessions', authenticate, requirePosRole, asyncRoute(async (req,res) => {
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
    const table = await c.query('SELECT id,capacity FROM dining_tables WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 AND is_active FOR UPDATE',[req.auth.tenant_id,req.auth.outlet_id,tableId]);
    if (!table.rowCount) return {status:404,body:{error:'Meja tidak ditemukan atau nonaktif.'}};
    if (guestCount>table.rows[0].capacity) return {status:400,body:{error:'Jumlah tamu melebihi kapasitas meja.'}};
    const active = await c.query("SELECT id FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND table_id=$3 AND status IN ('active','billing')",[req.auth.tenant_id,req.auth.outlet_id,tableId]);
    if (active.rowCount) return {status:409,body:{error:'Meja sedang digunakan.',sessionId:active.rows[0].id}};
    const settings = await c.query('SELECT COALESCE(os.service_charge_rate,ts.service_charge_rate,0) AS service_rate,COALESCE(os.tax_rate,ts.tax_rate,0) AS tax_rate,ts.default_payment_flow FROM tenant_settings ts LEFT JOIN outlet_settings os ON os.tenant_id=ts.tenant_id AND os.outlet_id=$2 WHERE ts.tenant_id=$1',[req.auth.tenant_id,req.auth.outlet_id]);
    const flow=settings.rows[0] || {service_rate:0,tax_rate:0,default_payment_flow:'payment_last'};
    const row = await c.query(`INSERT INTO dining_sessions(tenant_id,outlet_id,table_id,session_number,guest_count,opened_by_staff_id,waiter_staff_id,payment_flow,service_charge_rate,tax_rate)
      VALUES($1,$2,$3,'S-'||to_char(now(),'YYMMDDHH24MISSMS')||'-'||substr(gen_random_uuid()::text,1,6),$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.auth.tenant_id,req.auth.outlet_id,tableId,guestCount,req.auth.staff_id,waiterStaffId||req.auth.staff_id,flow.default_payment_flow,flow.service_rate,flow.tax_rate]);
    return {status:201,body:row.rows[0]};
  });
  res.status(result.status).json(result.body);
}));
app.get('/api/sessions/:sessionId/orders', authenticate, requirePosRole, asyncRoute(async (req,res) => {
  const rows = await scoped(req, c => c.query(`SELECT b.id AS batch_id,b.batch_number,b.status AS batch_status,b.note,b.created_at,
    oi.id,oi.menu_item_id,oi.item_name_snapshot,oi.category_snapshot,oi.destination,oi.unit_price,oi.quantity,oi.modifier_total,oi.line_total,oi.notes,oi.cooking_status,oi.is_served
    FROM order_batches b LEFT JOIN order_items oi ON oi.tenant_id=b.tenant_id AND oi.outlet_id=b.outlet_id AND oi.batch_id=b.id
    WHERE b.tenant_id=$1 AND b.outlet_id=$2 AND b.session_id=$3 ORDER BY b.batch_number,oi.created_at`,
    [req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]));
  res.json(rows.rows);
}));
app.post('/api/sessions/:sessionId/orders', authenticate, requirePosRole, asyncRoute(async (req,res) => {
  const { items, note } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length>100) return res.status(400).json({error:'items harus berisi 1–100 item.'});
  for (const item of items) if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>999) return res.status(400).json({error:'Setiap item memerlukan menuItemId dan quantity 1–999.'});
  const result = await scoped(req, async c => {
    const session = await c.query("SELECT id FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 AND status='active' FOR UPDATE",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    if (!session.rowCount) return {status:404,body:{error:'Sesi meja tidak aktif atau tidak ditemukan.'}};
    const catalog = await c.query(`SELECT id,name,destination,price,c.name AS category_name FROM menu_items m LEFT JOIN menu_categories c ON c.tenant_id=m.tenant_id AND c.id=m.category_id
      WHERE m.tenant_id=$1 AND (m.outlet_id IS NULL OR m.outlet_id=$2) AND m.is_available AND m.id=ANY($3::uuid[])`,
      [req.auth.tenant_id,req.auth.outlet_id,[...new Set(items.map(i=>i.menuItemId))]]);
    if (catalog.rowCount !== new Set(items.map(i=>i.menuItemId)).size) return {status:400,body:{error:'Satu atau lebih menu tidak tersedia.'}};
    const byId=new Map(catalog.rows.map(x=>[x.id,x]));
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
    }
    await c.query('UPDATE dining_sessions SET version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3',[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    return {status:201,body:{batch,items:created}};
  });
  res.status(result.status).json(result.body);
}));

app.post('/api/sessions/:sessionId/payments', authenticate, requirePosRole, asyncRoute(async (req,res) => {
  const { method, discountAmount=0, cashReceived, idempotencyKey, cardBank } = req.body || {};
  if (!['cash','qris','card','transfer','other'].includes(method) || typeof idempotencyKey!=='string' || idempotencyKey.length<8 || idempotencyKey.length>128 || !Number.isFinite(Number(discountAmount)) || Number(discountAmount)<0) return res.status(400).json({error:'Metode, idempotencyKey (8–128 karakter), atau diskon tidak valid.'});
  const result=await scoped(req,async c=>{
    const existing=await c.query('SELECT * FROM payments WHERE tenant_id=$1 AND outlet_id=$2 AND idempotency_key=$3',[req.auth.tenant_id,req.auth.outlet_id,idempotencyKey]);
    if(existing.rowCount) {
      const prior=existing.rows[0];
      const sameRequest = prior.session_id === req.params.sessionId &&
        prior.method === method && Number(prior.discount_amount) === Number(discountAmount) &&
        (method !== 'cash' || Number(prior.cash_received) === Number(cashReceived)) &&
        (prior.card_bank || null) === (cardBank || null);
      if (!sameRequest) return {status:409,body:{error:'Idempotency key sudah digunakan untuk payload pembayaran yang berbeda.'}};
      return {status:200,body:prior};
    }
    const session=await c.query("SELECT * FROM dining_sessions WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 AND status IN ('active','billing') FOR UPDATE",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    if(!session.rowCount) return {status:404,body:{error:'Sesi meja tidak ditemukan atau sudah ditutup.'}};
    const items=await c.query("SELECT id,line_total FROM order_items WHERE tenant_id=$1 AND outlet_id=$2 AND session_id=$3 AND cooking_status<>'cancelled' ORDER BY created_at FOR UPDATE",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    if(!items.rowCount) return {status:400,body:{error:'Tidak ada item pesanan yang dapat dibayar.'}};
    const subtotal=items.rows.reduce((sum,x)=>sum+Number(x.line_total),0), discount=Number(discountAmount);
    if(discount>subtotal) return {status:400,body:{error:'Diskon melebihi subtotal.'}};
    const service=Number((subtotal-discount)*Number(session.rows[0].service_charge_rate));
    const tax=Number(((subtotal-discount)+service)*Number(session.rows[0].tax_rate));
    const total=Number((subtotal-discount+service+tax).toFixed(2));
    const received=method==='cash'?Number(cashReceived):total;
    if(!Number.isFinite(received)||received<total) return {status:400,body:{error:'Uang diterima tidak cukup.'}};
    const receipt='R-'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)+'-'+randomBytes(3).toString('hex').toUpperCase();
    const payment=(await c.query(`INSERT INTO payments(tenant_id,outlet_id,session_id,receipt_number,method,card_bank,subtotal_amount,discount_amount,service_charge_amount,tax_amount,total_amount,cash_received,change_amount,cashier_staff_id,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId,receipt,method,cardBank||null,subtotal,discount,service,tax,total,received,received-total,req.auth.staff_id,idempotencyKey])).rows[0];
    for(const item of items.rows) if(Number(item.line_total)>0) await c.query('INSERT INTO payment_allocations(tenant_id,outlet_id,payment_id,order_item_id,amount) VALUES($1,$2,$3,$4,$5)',[req.auth.tenant_id,req.auth.outlet_id,payment.id,item.id,Number(item.line_total)]);
    await c.query("UPDATE dining_sessions SET status='closed',closed_at=now(),version=version+1 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3",[req.auth.tenant_id,req.auth.outlet_id,req.params.sessionId]);
    return {status:201,body:payment};
  });
  res.status(result.status).json(result.body);
}));

app.patch('/api/order-items/:itemId/kitchen-status', authenticate, requirePosRole, asyncRoute(async (req,res) => {
  const allowed=['queue','cooking','ready','handed_off','cancelled'];
  const status=req.body?.status;
  if (!allowed.includes(status)) return res.status(400).json({error:'Status KDS tidak valid.'});
  const row=await scoped(req,c=>c.query(`UPDATE order_items SET cooking_status=$1,is_served=CASE WHEN $1='handed_off' THEN true ELSE is_served END,served_at=CASE WHEN $1='handed_off' THEN now() ELSE served_at END
    WHERE tenant_id=$2 AND outlet_id=$3 AND id=$4 RETURNING *`,[status,req.auth.tenant_id,req.auth.outlet_id,req.params.itemId]));
  if (!row.rowCount) return res.status(404).json({error:'Item pesanan tidak ditemukan.'});
  res.json(row.rows[0]);
}));

// All outlet data endpoints set transaction-local RLS context after resolving the server-side session.
app.get('/api/tables', authenticate, requirePosRole, asyncRoute(async (req,res) => {
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
  if (!role || role.rolsuper || role.rolbypassrls || role.rolinherit || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.owns_public_objects || role.owns_public_schema || role.has_role_memberships || role.can_create_public_objects || role.can_create_schemas) {
    throw new Error('Unsafe DATABASE_URL role. API requires a dedicated non-owner role with NOSUPERUSER, NOBYPASSRLS, NOINHERIT and no privileged role memberships.');
  }
}
await assertSafeRuntimeRole();
const port=Number(process.env.PORT || 8080);
const server=app.listen(port,'0.0.0.0',()=>console.log('Gastro-Cashier API listening on '+port));
async function shutdown(){server.close();await pool.end();await bootstrapPool?.end();process.exit(0);}
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
