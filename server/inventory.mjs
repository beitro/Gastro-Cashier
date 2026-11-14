// Inventory API: items, suppliers, goods receipts (qty + value), waste, adjustments, stock take (opname),
// valuation reports, and recipe-based ingredient depletion for POS orders.
// All data access runs through the caller-provided `scoped()` helper (signed RLS context per transaction).
import { randomUUID, randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, body) {
    super(body?.error || 'HTTP ' + status);
    this.httpStatus = status;
    this.body = typeof body === 'string' ? { error: body } : body;
  }
}

export const INVENTORY_DEFAULTS = Object.freeze({
  deductIngredients: false, // opt-in: deplete raw materials from recipes when an order is placed
  negativeStockPolicy: 'allow', // 'allow' | 'block'
  costingMethod: 'weighted_average',
  lowStockAlerts: true,
  expiryWarningDays: 7,
  stockTakeRequiresApproval: true,
  staffCanCreateItems: true,
  maxReceiptBackdateDays: 7,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const round = (n, dp) => Number(Number(n).toFixed(dp));
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const cleanText = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const positive = (v, max = 1e9) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max;
const nonNegative = (v, max = 1e12) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const docNumber = (prefix) => prefix + '-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + randomBytes(2).toString('hex').toUpperCase();

export async function loadInventorySettings(c, tenantId) {
  const r = await c.query('SELECT settings FROM tenant_settings WHERE tenant_id=$1', [tenantId]);
  const stored = r.rows[0]?.settings?.inventory;
  return { ...INVENTORY_DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };
}

function mapItem(r) {
  const qty = num(r.current_quantity), avg = num(r.average_unit_cost), reorder = num(r.reorder_level);
  const max = r.max_level === null || r.max_level === undefined ? null : num(r.max_level);
  let status = 'ok';
  if (qty <= 0) status = 'out';
  else if (qty <= reorder) status = 'low';
  else if (max !== null && qty > max) status = 'over';
  return {
    id: r.id, sku: r.sku, name: r.name, unitCode: r.unit_code, category: r.category, barcode: r.barcode,
    storageZone: r.storage_zone, currentQuantity: qty, reorderLevel: reorder, maxLevel: max,
    averageUnitCost: avg, lastPurchaseCost: num(r.last_purchase_cost), stockValue: round(qty * avg, 2),
    defaultSupplierId: r.default_supplier_id, isActive: r.is_active, status,
    purchaseUnit: r.purchase_unit || null, conversionRatio: r.conversion_ratio ? num(r.conversion_ratio) : 1,
    nextExpiry: r.next_expiry || null, updatedAt: r.updated_at,
  };
}
const mapMovement = (r) => ({
  id: r.id, itemId: r.inventory_item_id, itemName: r.item_name, unitCode: r.unit_code, type: r.movement_type,
  quantityDelta: num(r.quantity_delta), unitCost: num(r.unit_cost), totalValue: r.total_value === null ? null : num(r.total_value),
  balanceAfter: r.balance_after === null ? null : num(r.balance_after), referenceType: r.reference_type, referenceId: r.reference_id,
  invoiceNo: r.invoice_no, expiryDate: r.expiry_date, supplierId: r.supplier_id, note: r.note,
  createdBy: r.created_by_name || null, createdAt: r.created_at,
});

// ---- core ledger primitive ---------------------------------------------------------------------
// `item` must be a row locked FOR UPDATE inside the current transaction.
async function postMovement(c, req, item, m) {
  const oldQty = num(item.current_quantity), oldAvg = num(item.average_unit_cost);
  const delta = round(m.delta, 4);
  if (delta === 0) return null;
  const newQty = round(oldQty + delta, 4);
  if (newQty < 0 && !m.allowNegative) {
    throw new HttpError(409, {
      error: 'Stok tidak mencukupi untuk ' + item.name + '.', code: 'INSUFFICIENT_INVENTORY',
      inventoryItemId: item.id, available: oldQty, requested: Math.abs(delta),
    });
  }
  let newAvg = oldAvg, unitCost;
  if ((m.type === 'purchase' || m.type === 'opening') && delta > 0) {
    unitCost = round(m.unitCost, 4);
    newAvg = oldQty > 0 ? round((oldQty * oldAvg + delta * unitCost) / (oldQty + delta), 4) : unitCost;
  } else {
    unitCost = m.unitCost !== undefined && m.unitCost !== null ? round(m.unitCost, 4) : oldAvg;
  }
  const totalValue = m.totalValue !== undefined && m.totalValue !== null ? round(m.totalValue, 2) : round(Math.abs(delta) * unitCost, 2);
  let lotId = null;
  if (delta > 0 && ['purchase', 'opening', 'adjustment'].includes(m.type)) {
    lotId = (await c.query(`INSERT INTO inventory_lots(tenant_id,outlet_id,inventory_item_id,supplier_id,lot_no,received_at,expiry_date,quantity_received,quantity_remaining,unit_cost)
      VALUES($1,$2,$3,$4,$5,COALESCE($6,now()),$7,$8,$8,$9) RETURNING id`,
      [req.auth.tenant_id, req.auth.outlet_id, item.id, m.supplierId || null, m.lotNo || null, m.receivedAt || null, m.expiryDate || null, delta, unitCost])).rows[0].id;
  }
  const movement = (await c.query(`INSERT INTO inventory_movements(tenant_id,outlet_id,inventory_item_id,movement_type,quantity_delta,unit_cost,total_value,balance_after,
      supplier_id,lot_id,invoice_no,expiry_date,reference_type,reference_id,note,created_by_staff_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [req.auth.tenant_id, req.auth.outlet_id, item.id, m.type, delta, unitCost, totalValue, newQty, m.supplierId || null, lotId, m.invoiceNo || null,
      m.expiryDate || null, m.referenceType || null, m.referenceId || null, m.note || null, req.auth.staff_id])).rows[0];
  if (delta < 0) await consumeLots(c, req, item.id, movement.id, -delta);
  await c.query(`UPDATE inventory_items SET current_quantity=$1,average_unit_cost=$2,
      last_purchase_cost=CASE WHEN $3::boolean THEN $4 ELSE last_purchase_cost END,updated_at=now()
    WHERE tenant_id=$5 AND outlet_id=$6 AND id=$7`,
  [newQty, newAvg, m.type === 'purchase' && delta > 0, unitCost, req.auth.tenant_id, req.auth.outlet_id, item.id]);
  item.current_quantity = newQty; item.average_unit_cost = newAvg;
  return movement;
}

// FEFO: earliest expiry first (NULL expiry last), then oldest received. Best effort: lots may hold less than current_quantity.
async function consumeLots(c, req, itemId, movementId, quantity) {
  const lots = await c.query(`SELECT id,quantity_remaining FROM inventory_lots
    WHERE tenant_id=$1 AND outlet_id=$2 AND inventory_item_id=$3 AND quantity_remaining>0
    ORDER BY expiry_date NULLS LAST,received_at,id FOR UPDATE`, [req.auth.tenant_id, req.auth.outlet_id, itemId]);
  let left = quantity;
  for (const lot of lots.rows) {
    if (left <= 0) break;
    const take = Math.min(left, num(lot.quantity_remaining));
    await c.query('UPDATE inventory_lots SET quantity_remaining=quantity_remaining-$1 WHERE tenant_id=$2 AND outlet_id=$3 AND id=$4', [take, req.auth.tenant_id, req.auth.outlet_id, lot.id]);
    await c.query('INSERT INTO inventory_lot_consumptions(tenant_id,outlet_id,movement_id,lot_id,quantity) VALUES($1,$2,$3,$4,$5)', [req.auth.tenant_id, req.auth.outlet_id, movementId, lot.id, take]);
    left = round(left - take, 4);
  }
}

async function lockItems(c, req, ids, { requireActive = true } = {}) {
  const unique = [...new Set(ids)].sort();
  const rows = await c.query('SELECT * FROM inventory_items WHERE tenant_id=$1 AND outlet_id=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE', [req.auth.tenant_id, req.auth.outlet_id, unique]);
  if (rows.rowCount !== unique.length) throw new HttpError(404, { error: 'Satu atau lebih bahan tidak ditemukan di outlet ini.' });
  const byId = new Map(rows.rows.map((r) => [r.id, r]));
  if (requireActive) for (const r of rows.rows) if (!r.is_active) throw new HttpError(409, { error: 'Bahan ' + r.name + ' nonaktif.' });
  return byId;
}

async function audit(c, req, action, entityType, entityId, metadata) {
  await c.query('INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id,ip_address,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
    [req.auth.tenant_id, req.auth.outlet_id, req.auth.staff_id, action, entityType, entityId ? String(entityId) : null, req.ip || null, req.get('user-agent') || null, JSON.stringify(metadata || {})]);
}

// ---- recipe depletion (called from the POS order/cancel transaction) -----------------------------
export async function depleteRecipeIngredients(c, req, settings, orderItems) {
  if (!settings.deductIngredients || !orderItems.length) return { applied: 0 };
  const menuIds = [...new Set(orderItems.map((o) => o.menuItemId))];
  const lines = await c.query(`WITH latest AS (
      SELECT DISTINCT ON (menu_item_id) id,menu_item_id FROM recipes
      WHERE tenant_id=$1 AND is_active AND (outlet_id IS NULL OR outlet_id=$2) AND menu_item_id=ANY($3::uuid[])
      ORDER BY menu_item_id,(outlet_id IS NULL),version DESC)
    SELECT l.menu_item_id,rl.inventory_item_id,rl.quantity FROM latest l
    JOIN recipe_lines rl ON rl.tenant_id=$1 AND rl.recipe_id=l.id`, [req.auth.tenant_id, req.auth.outlet_id, menuIds]);
  if (!lines.rowCount) return { applied: 0 };
  const byMenu = new Map();
  for (const l of lines.rows) { if (!byMenu.has(l.menu_item_id)) byMenu.set(l.menu_item_id, []); byMenu.get(l.menu_item_id).push(l); }
  const items = await lockItems(c, req, lines.rows.map((l) => l.inventory_item_id), { requireActive: false });
  const allowNegative = settings.negativeStockPolicy !== 'block';
  let applied = 0;
  for (const oi of orderItems) {
    for (const l of byMenu.get(oi.menuItemId) || []) {
      const item = items.get(l.inventory_item_id);
      const m = await postMovement(c, req, item, {
        type: 'sale', delta: -(num(l.quantity) * oi.quantity), referenceType: 'order_item', referenceId: oi.orderItemId,
        note: 'Resep: ' + oi.menuItemId, allowNegative,
      });
      if (m) applied++;
    }
  }
  return { applied };
}

export async function restoreRecipeIngredients(c, req, orderItemId) {
  const sold = await c.query(`SELECT m.* FROM inventory_movements m
    WHERE m.tenant_id=$1 AND m.outlet_id=$2 AND m.reference_type='order_item' AND m.reference_id=$3 AND m.movement_type='sale'
      AND NOT EXISTS (SELECT 1 FROM inventory_movements r WHERE r.tenant_id=m.tenant_id AND r.outlet_id=m.outlet_id AND r.reference_type='order_item'
        AND r.reference_id=m.reference_id AND r.inventory_item_id=m.inventory_item_id AND r.movement_type='return')
    ORDER BY m.inventory_item_id`, [req.auth.tenant_id, req.auth.outlet_id, orderItemId]);
  if (!sold.rowCount) return { restored: 0 };
  const items = await lockItems(c, req, sold.rows.map((s) => s.inventory_item_id), { requireActive: false });
  for (const s of sold.rows) {
    const item = items.get(s.inventory_item_id);
    const qty = Math.abs(num(s.quantity_delta));
    await postMovement(c, req, item, { type: 'return', delta: qty, unitCost: num(s.unit_cost), referenceType: 'order_item', referenceId: orderItemId, note: 'Pembatalan pesanan', allowNegative: true });
    const cons = await c.query('SELECT id,lot_id,quantity FROM inventory_lot_consumptions WHERE tenant_id=$1 AND outlet_id=$2 AND movement_id=$3 AND restored_at IS NULL', [req.auth.tenant_id, req.auth.outlet_id, s.id]);
    for (const k of cons.rows) {
      await c.query('UPDATE inventory_lots SET quantity_remaining=quantity_remaining+$1 WHERE tenant_id=$2 AND outlet_id=$3 AND id=$4', [k.quantity, req.auth.tenant_id, req.auth.outlet_id, k.lot_id]);
      await c.query('UPDATE inventory_lot_consumptions SET restored_at=now() WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3', [req.auth.tenant_id, req.auth.outlet_id, k.id]);
    }
    // 'return' movements never create new lots; consumed lots are restored above so lots are not doubled.
  }
  return { restored: sold.rowCount };
}

// ---- routes ------------------------------------------------------------------------------------
export function registerInventoryRoutes(app, { authenticate, asyncRoute, scoped, normalizeRole }) {
  const roleOf = (req) => normalizeRole(req.auth?.role_code);
  const allow = (roles, message) => (req, res, next) => {
    if (!req.auth || !roles.includes(roleOf(req))) return res.status(403).json({ error: message });
    next();
  };
  const canRead = allow(['owner', 'manager', 'inventory', 'finance'], 'Role Anda tidak memiliki akses melihat inventaris.');
  const canWrite = allow(['owner', 'manager', 'inventory'], 'Hanya Staff Inventory, Manager, atau Owner yang dapat menginput stok.');
  const canAdmin = allow(['owner', 'manager'], 'Hanya Manager atau Owner yang dapat melakukan aksi ini.');
  const route = (fn) => asyncRoute(async (req, res, next) => {
    try { await fn(req, res, next); } catch (e) {
      if (e instanceof HttpError) return res.status(e.httpStatus).json(e.body);
      if (e?.code === '23505') return res.status(409).json({ error: 'Data duplikat (SKU/nama sudah digunakan).', code: 'DUPLICATE' });
      throw e;
    }
  });

  // Items -----------------------------------------------------------------------------------------
  app.get('/api/inventory/items', authenticate, canRead, route(async (req, res) => {
    const { q, zone, category, status } = req.query;
    const includeInactive = req.query.includeInactive === 'true' && ['owner', 'manager'].includes(roleOf(req));
    const rows = await scoped(req, (c) => c.query(`SELECT i.*,
        (SELECT min(l.expiry_date) FROM inventory_lots l WHERE l.tenant_id=i.tenant_id AND l.outlet_id=i.outlet_id AND l.inventory_item_id=i.id AND l.quantity_remaining>0 AND l.expiry_date IS NOT NULL) AS next_expiry
      FROM inventory_items i WHERE i.tenant_id=$1 AND i.outlet_id=$2 AND ($3::boolean OR i.is_active)
        AND ($4::text IS NULL OR i.name ILIKE '%'||$4||'%' OR i.sku ILIKE '%'||$4||'%' OR i.barcode=$4)
        AND ($5::text IS NULL OR i.storage_zone=$5) AND ($6::text IS NULL OR i.category=$6)
      ORDER BY i.name LIMIT 1000`, [req.auth.tenant_id, req.auth.outlet_id, includeInactive, q ? String(q).slice(0, 80) : null, zone ? String(zone) : null, category ? String(category) : null]));
    let items = rows.rows.map(mapItem);
    if (status) items = items.filter((i) => i.status === status);
    res.json(items);
  }));

  app.post('/api/inventory/items', authenticate, canWrite, route(async (req, res) => {
    const b = req.body || {};
    const name = cleanText(b.name, 160), unit = cleanText(b.unitCode, 20);
    const reorder = b.reorderLevel === undefined ? 0 : b.reorderLevel, max = b.maxLevel === undefined || b.maxLevel === null ? null : b.maxLevel;
    const openQty = b.openingQuantity === undefined ? 0 : b.openingQuantity, openCost = b.openingUnitCost === undefined ? 0 : b.openingUnitCost;
    if (!name || !unit || !nonNegative(reorder) || (max !== null && !nonNegative(max)) || !nonNegative(openQty) || !nonNegative(openCost, 1e9)) {
      return res.status(400).json({ error: 'Nama, satuan, dan angka (min/max/stok awal/harga) wajib valid.' });
    }
    if (b.defaultSupplierId && !isUuid(b.defaultSupplierId)) return res.status(400).json({ error: 'Supplier tidak valid.' });
    const result = await scoped(req, async (c) => {
      const settings = await loadInventorySettings(c, req.auth.tenant_id);
      if (roleOf(req) === 'inventory' && !settings.staffCanCreateItems) throw new HttpError(403, { error: 'Pembuatan bahan baru dibatasi Manager/Owner oleh pengaturan sistem.' });
      if (openQty > 0 && !['owner', 'manager'].includes(roleOf(req))) throw new HttpError(403, { error: 'Stok awal hanya dapat diinput Manager/Owner; gunakan Penerimaan Barang.' });
      const item = (await c.query(`INSERT INTO inventory_items(tenant_id,outlet_id,sku,name,unit_code,category,barcode,storage_zone,reorder_level,max_level,default_supplier_id,purchase_unit,conversion_ratio)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.auth.tenant_id, req.auth.outlet_id, cleanText(b.sku, 48), name, unit, cleanText(b.category, 48), cleanText(b.barcode, 64), cleanText(b.storageZone, 48), reorder, max, b.defaultSupplierId || null, cleanText(b.purchaseUnit, 32), b.conversionRatio ? Number(b.conversionRatio) : 1.0])).rows[0];
      if (openQty > 0) {
        await postMovement(c, req, item, { type: 'opening', delta: openQty, unitCost: openCost, referenceType: 'opening', referenceId: item.id, note: 'Stok awal', allowNegative: false });
      }
      await audit(c, req, 'inventory_item.created', 'inventory_item', item.id, { name, unit, openingQuantity: openQty });
      return (await c.query('SELECT * FROM inventory_items WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3', [req.auth.tenant_id, req.auth.outlet_id, item.id])).rows[0];
    });
    res.status(201).json(mapItem(result));
  }));

  app.patch('/api/inventory/items/:itemId', authenticate, canAdmin, route(async (req, res) => {
    if (!isUuid(req.params.itemId)) return res.status(400).json({ error: 'ID bahan tidak valid.' });
    const b = req.body || {};
    const sets = [], vals = [req.auth.tenant_id, req.auth.outlet_id, req.params.itemId];
    const push = (col, v) => { vals.push(v); sets.push(col + '=$' + vals.length); };
    if (b.name !== undefined) { const v = cleanText(b.name, 160); if (!v) return res.status(400).json({ error: 'Nama tidak valid.' }); push('name', v); }
    if (b.sku !== undefined) push('sku', cleanText(b.sku, 48));
    if (b.category !== undefined) push('category', cleanText(b.category, 48));
    if (b.barcode !== undefined) push('barcode', cleanText(b.barcode, 64));
    if (b.storageZone !== undefined) push('storage_zone', cleanText(b.storageZone, 48));
    if (b.reorderLevel !== undefined) { if (!nonNegative(b.reorderLevel)) return res.status(400).json({ error: 'Reorder level tidak valid.' }); push('reorder_level', b.reorderLevel); }
    if (b.maxLevel !== undefined) { if (b.maxLevel !== null && !nonNegative(b.maxLevel)) return res.status(400).json({ error: 'Max level tidak valid.' }); push('max_level', b.maxLevel); }
    if (b.isActive !== undefined) { if (typeof b.isActive !== 'boolean') return res.status(400).json({ error: 'isActive harus boolean.' }); push('is_active', b.isActive); }
    if (b.defaultSupplierId !== undefined) { if (b.defaultSupplierId !== null && !isUuid(b.defaultSupplierId)) return res.status(400).json({ error: 'Supplier tidak valid.' }); push('default_supplier_id', b.defaultSupplierId); }
    if (b.unitCode !== undefined) push('unit_code', cleanText(b.unitCode, 20));
    if (b.purchaseUnit !== undefined) push('purchase_unit', cleanText(b.purchaseUnit, 32));
    if (b.conversionRatio !== undefined) {
      const cr = Number(b.conversionRatio);
      if (!Number.isFinite(cr) || cr <= 0) return res.status(400).json({ error: 'Rasio konversi harus angka positif.' });
      push('conversion_ratio', cr);
    }
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada perubahan.' });
    const item = await scoped(req, async (c) => {
      const cur = await c.query('SELECT * FROM inventory_items WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE', [req.auth.tenant_id, req.auth.outlet_id, req.params.itemId]);
      if (!cur.rowCount) throw new HttpError(404, { error: 'Bahan tidak ditemukan.' });
      if (b.unitCode !== undefined && b.unitCode !== cur.rows[0].unit_code) {
        const used = await c.query('SELECT 1 FROM inventory_movements WHERE tenant_id=$1 AND outlet_id=$2 AND inventory_item_id=$3 LIMIT 1', [req.auth.tenant_id, req.auth.outlet_id, req.params.itemId]);
        if (used.rowCount) throw new HttpError(409, { error: 'Satuan tidak dapat diubah setelah ada riwayat stok.' });
      }
      const updated = (await c.query('UPDATE inventory_items SET ' + sets.join(',') + ',updated_at=now() WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 RETURNING *', vals)).rows[0];
      await audit(c, req, 'inventory_item.updated', 'inventory_item', req.params.itemId, { changes: Object.keys(b) });
      return updated;
    });
    res.json(mapItem(item));
  }));

  app.get('/api/inventory/items/:itemId/movements', authenticate, canRead, route(async (req, res) => {
    if (!isUuid(req.params.itemId)) return res.status(400).json({ error: 'ID bahan tidak valid.' });
    const rows = await scoped(req, (c) => c.query(`SELECT m.*,i.name AS item_name,i.unit_code,a.display_name AS created_by_name
      FROM inventory_movements m JOIN inventory_items i ON i.tenant_id=m.tenant_id AND i.outlet_id=m.outlet_id AND i.id=m.inventory_item_id
      LEFT JOIN staff_accounts a ON a.id=m.created_by_staff_id
      WHERE m.tenant_id=$1 AND m.outlet_id=$2 AND m.inventory_item_id=$3 ORDER BY m.created_at DESC,m.id DESC LIMIT 200`,
    [req.auth.tenant_id, req.auth.outlet_id, req.params.itemId]));
    res.json(rows.rows.map(mapMovement));
  }));

  app.get('/api/inventory/movements', authenticate, canRead, route(async (req, res) => {
    const types = ['opening', 'purchase', 'sale', 'waste', 'adjustment', 'transfer_in', 'transfer_out', 'return'];
    const type = req.query.type ? String(req.query.type) : null;
    if (type && !types.includes(type)) return res.status(400).json({ error: 'Tipe movement tidak valid.' });
    const from = req.query.from && DATE_RE.test(String(req.query.from)) ? String(req.query.from) : null;
    const to = req.query.to && DATE_RE.test(String(req.query.to)) ? String(req.query.to) : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const rows = await scoped(req, (c) => c.query(`SELECT m.*,i.name AS item_name,i.unit_code,a.display_name AS created_by_name
      FROM inventory_movements m JOIN inventory_items i ON i.tenant_id=m.tenant_id AND i.outlet_id=m.outlet_id AND i.id=m.inventory_item_id
      LEFT JOIN staff_accounts a ON a.id=m.created_by_staff_id
      WHERE m.tenant_id=$1 AND m.outlet_id=$2 AND ($3::text IS NULL OR m.movement_type=$3)
        AND ($4::date IS NULL OR m.created_at>=$4::date) AND ($5::date IS NULL OR m.created_at<$5::date+1)
      ORDER BY m.created_at DESC,m.id DESC LIMIT $6`, [req.auth.tenant_id, req.auth.outlet_id, type, from, to, limit]));
    res.json(rows.rows.map(mapMovement));
  }));

  // Goods receipt: staff inputs quantity and value (unit cost or line total) ---------------------------
  app.post('/api/inventory/receipts', authenticate, canWrite, route(async (req, res) => {
    const b = req.body || {};
    const lines = b.lines;
    if (typeof b.idempotencyKey !== 'string' || b.idempotencyKey.length < 8 || b.idempotencyKey.length > 128) return res.status(400).json({ error: 'idempotencyKey 8–128 karakter wajib diisi.' });
    if (!Array.isArray(lines) || !lines.length || lines.length > 200) return res.status(400).json({ error: 'Penerimaan harus berisi 1–200 baris.' });
    if (b.supplierId && !isUuid(b.supplierId)) return res.status(400).json({ error: 'Supplier tidak valid.' });
    for (const l of lines) {
      const hasUnit = l.unitCost !== undefined && l.unitCost !== null, hasTotal = l.totalValue !== undefined && l.totalValue !== null;
      if (!isUuid(l.itemId) || !positive(l.quantity) || hasUnit === hasTotal || (hasUnit && !nonNegative(l.unitCost, 1e9)) || (hasTotal && !nonNegative(l.totalValue)) ||
        (l.expiryDate && !DATE_RE.test(String(l.expiryDate)))) {
        return res.status(400).json({ error: 'Setiap baris butuh itemId, quantity > 0, dan salah satu dari unitCost atau totalValue (≥ 0).' });
      }
    }
    let receivedAt = null;
    if (b.receivedAt) {
      const t = new Date(b.receivedAt);
      if (Number.isNaN(t.getTime()) || t.getTime() > Date.now() + 86400000) return res.status(400).json({ error: 'Tanggal penerimaan tidak valid.' });
      receivedAt = t.toISOString();
    }
    const result = await scoped(req, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['receipt:' + req.auth.tenant_id + ':' + req.auth.outlet_id + ':' + b.idempotencyKey]);
      const existing = await c.query('SELECT * FROM inventory_receipts WHERE tenant_id=$1 AND outlet_id=$2 AND idempotency_key=$3', [req.auth.tenant_id, req.auth.outlet_id, b.idempotencyKey]);
      if (existing.rowCount) return { status: 200, body: { receipt: existing.rows[0], duplicate: true } };
      const settings = await loadInventorySettings(c, req.auth.tenant_id);
      if (receivedAt && roleOf(req) === 'inventory' && Date.now() - new Date(receivedAt).getTime() > settings.maxReceiptBackdateDays * 86400000) {
        throw new HttpError(400, { error: 'Backdate penerimaan maksimal ' + settings.maxReceiptBackdateDays + ' hari untuk Staff Inventory.' });
      }
      if (b.supplierId) {
        const s = await c.query('SELECT 1 FROM suppliers WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 AND is_active', [req.auth.tenant_id, req.auth.outlet_id, b.supplierId]);
        if (!s.rowCount) throw new HttpError(404, { error: 'Supplier tidak ditemukan atau nonaktif.' });
      }
      const items = await lockItems(c, req, lines.map((l) => l.itemId));
      const receipt = (await c.query(`INSERT INTO inventory_receipts(tenant_id,outlet_id,receipt_number,supplier_id,invoice_no,received_at,note,idempotency_key,created_by_staff_id,attachment_url,attachment_mime)
        VALUES($1,$2,$3,$4,$5,COALESCE($6,now()),$7,$8,$9,$10,$11) RETURNING *`,
      [req.auth.tenant_id, req.auth.outlet_id, docNumber('GR'), b.supplierId || null, cleanText(b.invoiceNo, 64), receivedAt, cleanText(b.note, 500), b.idempotencyKey, req.auth.staff_id, cleanText(b.attachmentUrl, 1000000), cleanText(b.attachmentMime, 64)])).rows[0];
      let total = 0;
      const posted = [];
      for (const l of lines) {
        const item = items.get(l.itemId);
        const unitCost = l.totalValue !== undefined && l.totalValue !== null ? l.totalValue / l.quantity : l.unitCost;
        const m = await postMovement(c, req, item, {
          type: 'purchase', delta: l.quantity, unitCost, totalValue: l.totalValue ?? undefined, supplierId: b.supplierId, lotNo: cleanText(l.lotNo, 48),
          expiryDate: l.expiryDate || null, receivedAt, invoiceNo: receipt.invoice_no, referenceType: 'receipt', referenceId: receipt.id, note: cleanText(l.note, 300), allowNegative: true,
        });
        total += num(m.total_value);
        posted.push(mapMovement({ ...m, item_name: item.name, unit_code: item.unit_code }));
      }
      const updated = (await c.query('UPDATE inventory_receipts SET total_value=$1 WHERE tenant_id=$2 AND outlet_id=$3 AND id=$4 RETURNING *', [round(total, 2), req.auth.tenant_id, req.auth.outlet_id, receipt.id])).rows[0];
      await audit(c, req, 'inventory.receipt_posted', 'inventory_receipt', receipt.id, { lines: lines.length, totalValue: round(total, 2), invoiceNo: receipt.invoice_no });
      return { status: 201, body: { receipt: updated, lines: posted } };
    });
    res.status(result.status).json(result.body);
  }));

  app.get('/api/inventory/receipts', authenticate, canRead, route(async (req, res) => {
    const rows = await scoped(req, (c) => c.query(`SELECT r.*,s.name AS supplier_name,a.display_name AS created_by_name,
        (SELECT count(*)::int FROM inventory_movements m WHERE m.tenant_id=r.tenant_id AND m.outlet_id=r.outlet_id AND m.reference_type='receipt' AND m.reference_id=r.id) AS line_count
      FROM inventory_receipts r LEFT JOIN suppliers s ON s.tenant_id=r.tenant_id AND s.outlet_id=r.outlet_id AND s.id=r.supplier_id
      LEFT JOIN staff_accounts a ON a.id=r.created_by_staff_id
      WHERE r.tenant_id=$1 AND r.outlet_id=$2 ORDER BY r.received_at DESC,r.created_at DESC LIMIT 100`, [req.auth.tenant_id, req.auth.outlet_id]));
    res.json(rows.rows.map((r) => ({ id: r.id, receiptNumber: r.receipt_number, supplierId: r.supplier_id, supplierName: r.supplier_name, invoiceNo: r.invoice_no, receivedAt: r.received_at, totalValue: num(r.total_value), lineCount: r.line_count, note: r.note, createdBy: r.created_by_name, attachmentUrl: r.attachment_url || null, attachmentMime: r.attachment_mime || null })));
  }));

  // Waste / spoilage: reason is mandatory and the item cost is valued at current weighted average -------
  app.post('/api/inventory/waste', authenticate, canWrite, route(async (req, res) => {
    const b = req.body || {};
    const reason = cleanText(b.reason, 300);
    if (!isUuid(b.itemId) || !positive(b.quantity) || !reason || reason.length < 3) return res.status(400).json({ error: 'itemId, quantity > 0, dan alasan (min. 3 karakter) wajib diisi.' });
    const out = await scoped(req, async (c) => {
      const item = (await lockItems(c, req, [b.itemId], { requireActive: false })).get(b.itemId);
      const m = await postMovement(c, req, item, { type: 'waste', delta: -b.quantity, referenceType: 'waste', referenceId: randomUUID(), note: reason, allowNegative: false });
      await audit(c, req, 'inventory.waste_recorded', 'inventory_item', item.id, { quantity: b.quantity, reason, value: num(m.total_value) });
      return mapMovement({ ...m, item_name: item.name, unit_code: item.unit_code });
    });
    res.status(201).json(out);
  }));

  // Manual adjustment (Manager/Owner): set an absolute quantity or apply a delta ----------------------------
  app.post('/api/inventory/adjustments', authenticate, canAdmin, route(async (req, res) => {
    const b = req.body || {};
    const reason = cleanText(b.reason, 300);
    const hasNew = b.newQuantity !== undefined, hasDelta = b.delta !== undefined;
    if (!isUuid(b.itemId) || hasNew === hasDelta || (hasNew && !nonNegative(b.newQuantity)) || (hasDelta && (typeof b.delta !== 'number' || !Number.isFinite(b.delta) || b.delta === 0 || Math.abs(b.delta) > 1e9)) || !reason || reason.length < 3) {
      return res.status(400).json({ error: 'itemId, salah satu newQuantity/delta, dan alasan (min. 3 karakter) wajib valid.' });
    }
    const out = await scoped(req, async (c) => {
      const item = (await lockItems(c, req, [b.itemId], { requireActive: false })).get(b.itemId);
      const delta = hasNew ? round(b.newQuantity - num(item.current_quantity), 4) : b.delta;
      if (delta === 0) return { unchanged: true, item: mapItem(item) };
      const m = await postMovement(c, req, item, { type: 'adjustment', delta, referenceType: 'adjustment', referenceId: randomUUID(), note: reason, allowNegative: false });
      await audit(c, req, 'inventory.adjusted', 'inventory_item', item.id, { delta, reason });
      return { movement: mapMovement({ ...m, item_name: item.name, unit_code: item.unit_code }), item: mapItem(item) };
    });
    res.status(out.unchanged ? 200 : 201).json(out);
  }));

  // Stock take (opname) ---------------------------------------------------------------------------------
  async function applyStockTake(c, req, takeId, reviewNote) {
    const lines = await c.query('SELECT * FROM stock_take_lines WHERE tenant_id=$1 AND outlet_id=$2 AND stock_take_id=$3 ORDER BY inventory_item_id', [req.auth.tenant_id, req.auth.outlet_id, takeId]);
    const items = await lockItems(c, req, lines.rows.map((l) => l.inventory_item_id), { requireActive: false });
    let varianceValue = 0;
    for (const l of lines.rows) {
      const variance = num(l.variance_quantity);
      if (variance === 0) continue;
      const item = items.get(l.inventory_item_id);
      // Apply the counted variance relative to the snapshot so sales made since the count are preserved.
      const m = await postMovement(c, req, item, { type: 'adjustment', delta: variance, referenceType: 'stock_take', referenceId: takeId, note: 'Stock opname' + (l.note ? ': ' + l.note : ''), allowNegative: true });
      varianceValue += (variance < 0 ? -1 : 1) * num(m.total_value);
    }
    await c.query("UPDATE stock_takes SET status='approved',reviewed_by_staff_id=$1,reviewed_at=now(),review_note=$2,variance_value=$3 WHERE tenant_id=$4 AND outlet_id=$5 AND id=$6",
      [req.auth.staff_id, reviewNote, round(varianceValue, 2), req.auth.tenant_id, req.auth.outlet_id, takeId]);
    return round(varianceValue, 2);
  }

  app.post('/api/inventory/stock-takes', authenticate, canWrite, route(async (req, res) => {
    const b = req.body || {};
    if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 500) return res.status(400).json({ error: 'Stock opname harus berisi 1–500 baris.' });
    const seen = new Set();
    for (const l of b.lines) {
      if (!isUuid(l.itemId) || !nonNegative(l.countedQuantity) || seen.has(l.itemId)) return res.status(400).json({ error: 'Setiap baris butuh itemId unik dan countedQuantity ≥ 0.' });
      seen.add(l.itemId);
    }
    const out = await scoped(req, async (c) => {
      const settings = await loadInventorySettings(c, req.auth.tenant_id);
      const items = await lockItems(c, req, b.lines.map((l) => l.itemId), { requireActive: false });
      const take = (await c.query(`INSERT INTO stock_takes(tenant_id,outlet_id,take_number,storage_zone,note,submitted_by_staff_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.auth.tenant_id, req.auth.outlet_id, docNumber('SO'), cleanText(b.storageZone, 48), cleanText(b.note, 500), req.auth.staff_id])).rows[0];
      for (const l of b.lines) {
        const item = items.get(l.itemId);
        const system = num(item.current_quantity), variance = round(l.countedQuantity - system, 4), cost = num(item.average_unit_cost);
        await c.query(`INSERT INTO stock_take_lines(tenant_id,outlet_id,stock_take_id,inventory_item_id,system_quantity,counted_quantity,variance_quantity,unit_cost,variance_value,note)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [req.auth.tenant_id, req.auth.outlet_id, take.id, item.id, system, l.countedQuantity, variance, cost, round(variance * cost, 2), cleanText(l.note, 200)]);
      }
      let status = 'submitted', varianceValue = null;
      if (!settings.stockTakeRequiresApproval && ['owner', 'manager'].includes(roleOf(req))) {
        varianceValue = await applyStockTake(c, req, take.id, 'Auto-approved (pengaturan sistem)');
        status = 'approved';
      }
      await audit(c, req, 'inventory.stock_take_submitted', 'stock_take', take.id, { lines: b.lines.length, status });
      return { id: take.id, takeNumber: take.take_number, status, varianceValue };
    });
    res.status(201).json(out);
  }));

  app.get('/api/inventory/stock-takes', authenticate, canRead, route(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    if (status && !['submitted', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });
    const rows = await scoped(req, (c) => c.query(`SELECT t.*,s.display_name AS submitted_by,r.display_name AS reviewed_by,
        (SELECT count(*)::int FROM stock_take_lines l WHERE l.tenant_id=t.tenant_id AND l.outlet_id=t.outlet_id AND l.stock_take_id=t.id) AS line_count,
        (SELECT COALESCE(sum(l.variance_value),0) FROM stock_take_lines l WHERE l.tenant_id=t.tenant_id AND l.outlet_id=t.outlet_id AND l.stock_take_id=t.id) AS projected_variance_value
      FROM stock_takes t LEFT JOIN staff_accounts s ON s.id=t.submitted_by_staff_id LEFT JOIN staff_accounts r ON r.id=t.reviewed_by_staff_id
      WHERE t.tenant_id=$1 AND t.outlet_id=$2 AND ($3::text IS NULL OR t.status=$3) ORDER BY t.submitted_at DESC LIMIT 100`, [req.auth.tenant_id, req.auth.outlet_id, status]));
    res.json(rows.rows.map((t) => ({ id: t.id, takeNumber: t.take_number, status: t.status, storageZone: t.storage_zone, note: t.note, submittedBy: t.submitted_by, submittedAt: t.submitted_at, reviewedBy: t.reviewed_by, reviewedAt: t.reviewed_at, reviewNote: t.review_note, lineCount: t.line_count, varianceValue: t.variance_value === null ? num(t.projected_variance_value) : num(t.variance_value) })));
  }));

  app.get('/api/inventory/stock-takes/:takeId', authenticate, canRead, route(async (req, res) => {
    if (!isUuid(req.params.takeId)) return res.status(400).json({ error: 'ID tidak valid.' });
    const rows = await scoped(req, (c) => c.query(`SELECT l.*,i.name,i.unit_code FROM stock_take_lines l JOIN inventory_items i ON i.tenant_id=l.tenant_id AND i.outlet_id=l.outlet_id AND i.id=l.inventory_item_id
      WHERE l.tenant_id=$1 AND l.outlet_id=$2 AND l.stock_take_id=$3 ORDER BY i.name`, [req.auth.tenant_id, req.auth.outlet_id, req.params.takeId]));
    if (!rows.rowCount) return res.status(404).json({ error: 'Stock opname tidak ditemukan.' });
    res.json(rows.rows.map((l) => ({ itemId: l.inventory_item_id, name: l.name, unitCode: l.unit_code, systemQuantity: num(l.system_quantity), countedQuantity: num(l.counted_quantity), varianceQuantity: num(l.variance_quantity), unitCost: num(l.unit_cost), varianceValue: num(l.variance_value), note: l.note })));
  }));

  app.post('/api/inventory/stock-takes/:takeId/approve', authenticate, canAdmin, route(async (req, res) => {
    if (!isUuid(req.params.takeId)) return res.status(400).json({ error: 'ID tidak valid.' });
    const out = await scoped(req, async (c) => {
      const take = await c.query('SELECT * FROM stock_takes WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE', [req.auth.tenant_id, req.auth.outlet_id, req.params.takeId]);
      if (!take.rowCount) throw new HttpError(404, { error: 'Stock opname tidak ditemukan.' });
      if (take.rows[0].status !== 'submitted') throw new HttpError(409, { error: 'Stock opname sudah ' + take.rows[0].status + '.' });
      const varianceValue = await applyStockTake(c, req, req.params.takeId, cleanText(req.body?.note, 300));
      await audit(c, req, 'inventory.stock_take_approved', 'stock_take', req.params.takeId, { varianceValue });
      return { id: req.params.takeId, status: 'approved', varianceValue };
    });
    res.json(out);
  }));

  app.post('/api/inventory/stock-takes/:takeId/reject', authenticate, canAdmin, route(async (req, res) => {
    if (!isUuid(req.params.takeId)) return res.status(400).json({ error: 'ID tidak valid.' });
    const note = cleanText(req.body?.note, 300);
    if (!note || note.length < 3) return res.status(400).json({ error: 'Alasan penolakan (min. 3 karakter) wajib diisi.' });
    const out = await scoped(req, async (c) => {
      const take = await c.query('SELECT status FROM stock_takes WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 FOR UPDATE', [req.auth.tenant_id, req.auth.outlet_id, req.params.takeId]);
      if (!take.rowCount) throw new HttpError(404, { error: 'Stock opname tidak ditemukan.' });
      if (take.rows[0].status !== 'submitted') throw new HttpError(409, { error: 'Stock opname sudah ' + take.rows[0].status + '.' });
      await c.query("UPDATE stock_takes SET status='rejected',reviewed_by_staff_id=$1,reviewed_at=now(),review_note=$2 WHERE tenant_id=$3 AND outlet_id=$4 AND id=$5", [req.auth.staff_id, note, req.auth.tenant_id, req.auth.outlet_id, req.params.takeId]);
      await audit(c, req, 'inventory.stock_take_rejected', 'stock_take', req.params.takeId, { note });
      return { id: req.params.takeId, status: 'rejected' };
    });
    res.json(out);
  }));

  // Suppliers --------------------------------------------------------------------------------------------
  const mapSupplier = (s) => ({ id: s.id, name: s.name, contactName: s.contact_name, phone: s.phone, email: s.email, address: s.address, note: s.note, isActive: s.is_active });
  app.get('/api/inventory/suppliers', authenticate, canRead, route(async (req, res) => {
    const rows = await scoped(req, (c) => c.query('SELECT * FROM suppliers WHERE tenant_id=$1 AND outlet_id=$2 ORDER BY is_active DESC,name', [req.auth.tenant_id, req.auth.outlet_id]));
    res.json(rows.rows.map(mapSupplier));
  }));
  app.post('/api/inventory/suppliers', authenticate, canWrite, route(async (req, res) => {
    const b = req.body || {}, name = cleanText(b.name, 160);
    if (!name) return res.status(400).json({ error: 'Nama supplier wajib diisi.' });
    const row = await scoped(req, async (c) => {
      const s = (await c.query('INSERT INTO suppliers(tenant_id,outlet_id,name,contact_name,phone,email,address,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [req.auth.tenant_id, req.auth.outlet_id, name, cleanText(b.contactName, 120), cleanText(b.phone, 40), cleanText(b.email, 254), cleanText(b.address, 500), cleanText(b.note, 500)])).rows[0];
      await audit(c, req, 'supplier.created', 'supplier', s.id, { name });
      return s;
    });
    res.status(201).json(mapSupplier(row));
  }));
  app.patch('/api/inventory/suppliers/:supplierId', authenticate, canAdmin, route(async (req, res) => {
    if (!isUuid(req.params.supplierId)) return res.status(400).json({ error: 'ID tidak valid.' });
    const b = req.body || {}, sets = [], vals = [req.auth.tenant_id, req.auth.outlet_id, req.params.supplierId];
    const push = (col, v) => { vals.push(v); sets.push(col + '=$' + vals.length); };
    if (b.name !== undefined) { const v = cleanText(b.name, 160); if (!v) return res.status(400).json({ error: 'Nama tidak valid.' }); push('name', v); }
    if (b.contactName !== undefined) push('contact_name', cleanText(b.contactName, 120));
    if (b.phone !== undefined) push('phone', cleanText(b.phone, 40));
    if (b.email !== undefined) push('email', cleanText(b.email, 254));
    if (b.address !== undefined) push('address', cleanText(b.address, 500));
    if (b.note !== undefined) push('note', cleanText(b.note, 500));
    if (b.isActive !== undefined) { if (typeof b.isActive !== 'boolean') return res.status(400).json({ error: 'isActive harus boolean.' }); push('is_active', b.isActive); }
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada perubahan.' });
    const row = await scoped(req, async (c) => {
      const r = await c.query('UPDATE suppliers SET ' + sets.join(',') + ',updated_at=now() WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 RETURNING *', vals);
      if (!r.rowCount) throw new HttpError(404, { error: 'Supplier tidak ditemukan.' });
      await audit(c, req, 'supplier.updated', 'supplier', req.params.supplierId, { changes: Object.keys(b) });
      return r.rows[0];
    });
    res.json(mapSupplier(row));
  }));

  // Valuation dashboard -----------------------------------------------------------------------------------
  app.get('/api/inventory/summary', authenticate, canRead, route(async (req, res) => {
    const out = await scoped(req, async (c) => {
      const settings = await loadInventorySettings(c, req.auth.tenant_id);
      const p = [req.auth.tenant_id, req.auth.outlet_id];
      const totals = (await c.query(`SELECT count(*)::int AS items,COALESCE(sum(current_quantity*average_unit_cost),0) AS value,
          count(*) FILTER (WHERE current_quantity<=0)::int AS out_count,
          count(*) FILTER (WHERE current_quantity>0 AND current_quantity<=reorder_level)::int AS low_count
        FROM inventory_items WHERE tenant_id=$1 AND outlet_id=$2 AND is_active`, p)).rows[0];
      const byZone = (await c.query(`SELECT COALESCE(storage_zone,'Tanpa Zona') AS zone,count(*)::int AS items,COALESCE(sum(current_quantity*average_unit_cost),0) AS value
        FROM inventory_items WHERE tenant_id=$1 AND outlet_id=$2 AND is_active GROUP BY 1 ORDER BY 3 DESC`, p)).rows;
      const lowStock = (await c.query(`SELECT * FROM inventory_items WHERE tenant_id=$1 AND outlet_id=$2 AND is_active AND current_quantity<=reorder_level ORDER BY (current_quantity/NULLIF(reorder_level,0)) NULLS FIRST,name LIMIT 50`, p)).rows;
      const expiring = (await c.query(`SELECT l.id,l.lot_no,l.expiry_date,l.quantity_remaining,i.id AS item_id,i.name,i.unit_code
        FROM inventory_lots l JOIN inventory_items i ON i.tenant_id=l.tenant_id AND i.outlet_id=l.outlet_id AND i.id=l.inventory_item_id
        WHERE l.tenant_id=$1 AND l.outlet_id=$2 AND l.quantity_remaining>0 AND l.expiry_date IS NOT NULL AND l.expiry_date<=current_date+$3::int
        ORDER BY l.expiry_date LIMIT 50`, [...p, settings.expiryWarningDays])).rows;
      const flows = (await c.query(`SELECT
          COALESCE(sum(total_value) FILTER (WHERE movement_type='purchase' AND created_at>=date_trunc('month',now())),0) AS purchases_month,
          COALESCE(sum(total_value) FILTER (WHERE movement_type='waste' AND created_at>=date_trunc('month',now())),0) AS waste_month,
          COALESCE(sum(CASE movement_type WHEN 'sale' THEN total_value WHEN 'return' THEN -total_value END) FILTER (WHERE movement_type IN ('sale','return') AND reference_type='order_item' AND created_at>=date_trunc('month',now())),0) AS usage_month
        FROM inventory_movements WHERE tenant_id=$1 AND outlet_id=$2`, p)).rows[0];
      const pending = (await c.query("SELECT count(*)::int AS n FROM stock_takes WHERE tenant_id=$1 AND outlet_id=$2 AND status='submitted'", p)).rows[0].n;
      return {
        totals: { items: totals.items, stockValue: round(num(totals.value), 2), outOfStock: totals.out_count, lowStock: totals.low_count },
        byZone: byZone.map((z) => ({ zone: z.zone, items: z.items, value: round(num(z.value), 2) })),
        lowStock: lowStock.map(mapItem),
        expiringLots: expiring.map((e) => ({ lotId: e.id, lotNo: e.lot_no, expiryDate: e.expiry_date, quantityRemaining: num(e.quantity_remaining), itemId: e.item_id, name: e.name, unitCode: e.unit_code })),
        month: { purchases: round(num(flows.purchases_month), 2), waste: round(num(flows.waste_month), 2), ingredientUsage: round(num(flows.usage_month), 2) },
        pendingStockTakes: pending, expiryWarningDays: settings.expiryWarningDays,
      };
    });
    res.json(out);
  }));
}
