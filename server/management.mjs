// System/app settings and manager/owner menu administration (menu items, categories, recipes/BOM).
import { randomUUID } from 'node:crypto';
import { HttpError, INVENTORY_DEFAULTS } from './inventory.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const round = (n, dp) => Number(Number(n).toFixed(dp));
const cleanText = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const nonNegative = (v, max = 1e12) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

export const APP_SETTING_DEFAULTS = Object.freeze({
  restaurantName: '', receiptFooter: 'Terima kasih atas kunjungan Anda', receiptShowTax: true,
  autoPrintReceipt: false, soundEnabled: true, locale: 'id-ID',
});

// Allow-list validators: unknown keys are rejected so settings cannot be used as arbitrary storage.
const INVENTORY_VALIDATORS = {
  deductIngredients: (v) => typeof v === 'boolean',
  negativeStockPolicy: (v) => v === 'allow' || v === 'block',
  costingMethod: (v) => v === 'weighted_average',
  lowStockAlerts: (v) => typeof v === 'boolean',
  expiryWarningDays: (v) => Number.isInteger(v) && v >= 0 && v <= 365,
  stockTakeRequiresApproval: (v) => typeof v === 'boolean',
  staffCanCreateItems: (v) => typeof v === 'boolean',
  maxReceiptBackdateDays: (v) => Number.isInteger(v) && v >= 0 && v <= 90,
};
const APP_VALIDATORS = {
  restaurantName: (v) => typeof v === 'string' && v.length <= 120,
  receiptFooter: (v) => typeof v === 'string' && v.length <= 300,
  receiptShowTax: (v) => typeof v === 'boolean',
  autoPrintReceipt: (v) => typeof v === 'boolean',
  soundEnabled: (v) => typeof v === 'boolean',
  locale: (v) => v === 'id-ID' || v === 'en-US',
};
function validateSection(name, input, validators) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, { error: 'Bagian ' + name + ' harus berupa objek.' });
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (!validators[k]) throw new HttpError(400, { error: 'Pengaturan ' + name + '.' + k + ' tidak dikenal.' });
    if (!validators[k](v)) throw new HttpError(400, { error: 'Nilai pengaturan ' + name + '.' + k + ' tidak valid.' });
    out[k] = v;
  }
  return out;
}
const rate = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function registerManagementRoutes(app, { authenticate, asyncRoute, scoped, normalizeRole }) {
  const roleOf = (req) => normalizeRole(req.auth?.role_code);
  const managerOrOwner = (req, res, next) => {
    if (!req.auth || !['owner', 'manager'].includes(roleOf(req))) return res.status(403).json({ error: 'Hanya Manager atau Owner yang dapat mengelola menu.' });
    next();
  };
  const route = (fn) => asyncRoute(async (req, res, next) => {
    try { await fn(req, res, next); } catch (e) {
      if (e instanceof HttpError) return res.status(e.httpStatus).json(e.body);
      if (e?.code === '23505') return res.status(409).json({ error: 'Data duplikat (SKU/kode sudah digunakan).', code: 'DUPLICATE' });
      throw e;
    }
  });
  const audit = (c, req, action, type, id, metadata) => c.query(
    'INSERT INTO audit_logs(tenant_id,outlet_id,actor_staff_id,action,entity_type,entity_id,ip_address,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
    [req.auth.tenant_id, req.auth.outlet_id, req.auth.staff_id, action, type, id ? String(id) : null, req.ip || null, req.get('user-agent') || null, JSON.stringify(metadata || {})]);

  // ---- settings ------------------------------------------------------------------------------------
  async function readSettings(c, req) {
    const t = (await c.query('SELECT * FROM tenant_settings WHERE tenant_id=$1', [req.auth.tenant_id])).rows[0];
    const o = (await c.query('SELECT * FROM outlet_settings WHERE tenant_id=$1 AND outlet_id=$2', [req.auth.tenant_id, req.auth.outlet_id])).rows[0];
    const stored = t?.settings || {};
    const tenant = {
      serviceChargeRate: num(t?.service_charge_rate), taxRate: num(t?.tax_rate), serviceInTaxBase: t ? t.service_in_tax_base : true,
      defaultPaymentFlow: t?.default_payment_flow || 'payment_last',
    };
    return {
      tenant,
      outlet: { serviceChargeRate: o?.service_charge_rate == null ? null : num(o.service_charge_rate), taxRate: o?.tax_rate == null ? null : num(o.tax_rate) },
      effective: {
        serviceChargeRate: o?.service_charge_rate == null ? tenant.serviceChargeRate : num(o.service_charge_rate),
        taxRate: o?.tax_rate == null ? tenant.taxRate : num(o.tax_rate),
      },
      inventory: { ...INVENTORY_DEFAULTS, ...(stored.inventory || {}) },
      app: { ...APP_SETTING_DEFAULTS, ...(stored.app || {}) },
      outletApp: o?.settings || {},
    };
  }

  app.get('/api/settings', authenticate, route(async (req, res) => {
    const settings = await scoped(req, (c) => readSettings(c, req));
    res.json({ ...settings, permissions: { editFinancial: roleOf(req) === 'owner', editInventory: ['owner', 'manager'].includes(roleOf(req)), editApp: ['owner', 'manager'].includes(roleOf(req)) } });
  }));

  app.put('/api/settings', authenticate, managerOrOwner, route(async (req, res) => {
    const b = req.body || {};
    const allowedTop = ['tenant', 'outlet', 'inventory', 'app'];
    for (const k of Object.keys(b)) if (!allowedTop.includes(k)) return res.status(400).json({ error: 'Bagian pengaturan ' + k + ' tidak dikenal.' });
    const inventoryPatch = validateSection('inventory', b.inventory, INVENTORY_VALIDATORS);
    const appPatch = validateSection('app', b.app, APP_VALIDATORS);
    const tenantPatch = b.tenant, outletPatch = b.outlet;
    if ((tenantPatch !== undefined || outletPatch !== undefined) && roleOf(req) !== 'owner') {
      return res.status(403).json({ error: 'Pajak, service charge, dan alur pembayaran hanya dapat diubah Owner.' });
    }
    if (tenantPatch !== undefined) {
      const allowed = { serviceChargeRate: rate, taxRate: rate, serviceInTaxBase: (v) => typeof v === 'boolean', defaultPaymentFlow: (v) => v === 'payment_last' || v === 'payment_first' };
      for (const [k, v] of Object.entries(tenantPatch || {})) if (!allowed[k] || !allowed[k](v)) return res.status(400).json({ error: 'Pengaturan tenant.' + k + ' tidak valid (tarif 0–1).' });
    }
    if (outletPatch !== undefined) {
      for (const [k, v] of Object.entries(outletPatch || {})) if (!['serviceChargeRate', 'taxRate'].includes(k) || (v !== null && !rate(v))) return res.status(400).json({ error: 'Pengaturan outlet.' + k + ' tidak valid (tarif 0–1 atau null).' });
    }
    const result = await scoped(req, async (c) => {
      const before = await readSettings(c, req);
      const merged = { inventory: { ...before.inventory, ...inventoryPatch }, app: { ...before.app, ...appPatch } };
      const t = { ...before.tenant, ...(tenantPatch || {}) };
      await c.query(`INSERT INTO tenant_settings(tenant_id,service_charge_rate,tax_rate,service_in_tax_base,default_payment_flow,settings,updated_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,now())
        ON CONFLICT(tenant_id) DO UPDATE SET service_charge_rate=EXCLUDED.service_charge_rate,tax_rate=EXCLUDED.tax_rate,service_in_tax_base=EXCLUDED.service_in_tax_base,
          default_payment_flow=EXCLUDED.default_payment_flow,settings=tenant_settings.settings||EXCLUDED.settings,updated_at=now()`,
      [req.auth.tenant_id, t.serviceChargeRate, t.taxRate, t.serviceInTaxBase, t.defaultPaymentFlow, JSON.stringify(merged)]);
      if (outletPatch !== undefined) {
        const o = { ...before.outlet, ...outletPatch };
        await c.query(`INSERT INTO outlet_settings(tenant_id,outlet_id,service_charge_rate,tax_rate,updated_at) VALUES($1,$2,$3,$4,now())
          ON CONFLICT(tenant_id,outlet_id) DO UPDATE SET service_charge_rate=EXCLUDED.service_charge_rate,tax_rate=EXCLUDED.tax_rate,updated_at=now()`,
        [req.auth.tenant_id, req.auth.outlet_id, o.serviceChargeRate, o.taxRate]);
      }
      await audit(c, req, 'settings.updated', 'settings', req.auth.tenant_id, { sections: Object.keys(b), inventory: inventoryPatch, app: appPatch, tenant: tenantPatch, outlet: outletPatch });
      return readSettings(c, req);
    });
    res.json(result);
  }));

  // ---- categories ------------------------------------------------------------------------------------
  app.get('/api/admin/menu/categories', authenticate, managerOrOwner, route(async (req, res) => {
    const rows = await scoped(req, (c) => c.query('SELECT id,code,name,sort_order,is_active FROM menu_categories WHERE tenant_id=$1 ORDER BY sort_order,name', [req.auth.tenant_id]));
    res.json(rows.rows.map((r) => ({ id: r.id, code: r.code, name: r.name, sortOrder: r.sort_order, isActive: r.is_active })));
  }));
  app.post('/api/admin/menu/categories', authenticate, managerOrOwner, route(async (req, res) => {
    const name = cleanText(req.body?.name, 100);
    if (!name) return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
    const code = (cleanText(req.body?.code, 40) || name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'kategori';
    const sortOrder = Number.isInteger(req.body?.sortOrder) ? req.body.sortOrder : 0;
    const row = await scoped(req, async (c) => {
      const r = (await c.query('INSERT INTO menu_categories(tenant_id,code,name,sort_order) VALUES($1,$2,$3,$4) RETURNING *', [req.auth.tenant_id, code, name, sortOrder])).rows[0];
      await audit(c, req, 'menu_category.created', 'menu_category', r.id, { name, code });
      return r;
    });
    res.status(201).json({ id: row.id, code: row.code, name: row.name, sortOrder: row.sort_order, isActive: row.is_active });
  }));

  // ---- menu items ------------------------------------------------------------------------------------
  const MENU_SELECT = `SELECT m.id,m.sku,m.name,m.description,m.destination,m.price,m.cost_price,m.image_url,m.category_id,m.is_available,m.sort_order,m.outlet_id,
      c.name AS category_name,COALESCE(ms.track_stock,false) AS track_stock,ms.quantity AS stock_quantity,
      (SELECT COALESCE(sum(rl.quantity*ii.average_unit_cost),0) FROM recipes r JOIN recipe_lines rl ON rl.tenant_id=r.tenant_id AND rl.recipe_id=r.id
        JOIN inventory_items ii ON ii.tenant_id=rl.tenant_id AND ii.id=rl.inventory_item_id
        WHERE r.tenant_id=m.tenant_id AND r.menu_item_id=m.id AND r.is_active AND (r.outlet_id IS NULL OR r.outlet_id=$2)
          AND r.version=(SELECT max(version) FROM recipes r2 WHERE r2.tenant_id=r.tenant_id AND r2.menu_item_id=r.menu_item_id AND r2.is_active AND (r2.outlet_id IS NULL OR r2.outlet_id=$2))) AS recipe_cost,
      EXISTS (SELECT 1 FROM recipes r WHERE r.tenant_id=m.tenant_id AND r.menu_item_id=m.id AND r.is_active AND (r.outlet_id IS NULL OR r.outlet_id=$2)) AS has_recipe
    FROM menu_items m LEFT JOIN menu_categories c ON c.tenant_id=m.tenant_id AND c.id=m.category_id
    LEFT JOIN menu_stock ms ON ms.tenant_id=m.tenant_id AND ms.outlet_id=$2 AND ms.menu_item_id=m.id`;
  const mapMenu = (r) => {
    const price = num(r.price), cost = num(r.cost_price), recipeCost = round(num(r.recipe_cost), 2);
    const effectiveCost = r.has_recipe ? recipeCost : cost;
    return {
      id: r.id, sku: r.sku, name: r.name, description: r.description, destination: r.destination, price, costPrice: cost,
      imageUrl: r.image_url, categoryId: r.category_id, categoryName: r.category_name, isAvailable: r.is_available, sortOrder: r.sort_order,
      scope: r.outlet_id ? 'outlet' : 'tenant', trackStock: r.track_stock, stockQuantity: r.stock_quantity === null ? null : Number(r.stock_quantity),
      hasRecipe: r.has_recipe, recipeCost, marginPercent: price > 0 ? round(((price - effectiveCost) / price) * 100, 1) : 0,
    };
  };
  const loadMenuItem = async (c, req, id) => {
    const r = await c.query(MENU_SELECT + ' WHERE m.tenant_id=$1 AND (m.outlet_id IS NULL OR m.outlet_id=$2) AND m.id=$3', [req.auth.tenant_id, req.auth.outlet_id, id]);
    return r.rows[0] ? mapMenu(r.rows[0]) : null;
  };

  app.get('/api/admin/menu', authenticate, managerOrOwner, route(async (req, res) => {
    const rows = await scoped(req, (c) => c.query(MENU_SELECT + ' WHERE m.tenant_id=$1 AND (m.outlet_id IS NULL OR m.outlet_id=$2) ORDER BY c.sort_order NULLS LAST,m.sort_order,m.name', [req.auth.tenant_id, req.auth.outlet_id]));
    res.json(rows.rows.map(mapMenu));
  }));

  function validateMenuBody(b, { partial }) {
    const out = {};
    const need = (cond, msg) => { if (!cond) throw new HttpError(400, { error: msg }); };
    if (!partial || b.name !== undefined) { out.name = cleanText(b.name, 160); need(out.name, 'Nama menu wajib diisi.'); }
    if (!partial || b.price !== undefined) { need(nonNegative(b.price, 1e9), 'Harga jual harus angka ≥ 0.'); out.price = round(b.price, 2); }
    if (b.costPrice !== undefined) { need(nonNegative(b.costPrice, 1e9), 'HPP harus angka ≥ 0.'); out.cost_price = round(b.costPrice, 2); }
    if (b.destination !== undefined) { need(['kitchen', 'bar', 'other'].includes(b.destination), 'Destinasi harus kitchen/bar/other.'); out.destination = b.destination; }
    if (b.sku !== undefined) out.sku = cleanText(b.sku, 48);
    if (b.description !== undefined) out.description = cleanText(b.description, 1000);
    if (b.imageUrl !== undefined) { const u = cleanText(b.imageUrl, 1000); need(!u || /^https?:\/\//i.test(u), 'URL gambar harus http(s).'); out.image_url = u; }
    if (b.categoryId !== undefined) { need(b.categoryId === null || isUuid(b.categoryId), 'Kategori tidak valid.'); out.category_id = b.categoryId; }
    if (b.isAvailable !== undefined) { need(typeof b.isAvailable === 'boolean', 'isAvailable harus boolean.'); out.is_available = b.isAvailable; }
    if (b.sortOrder !== undefined) { need(Number.isInteger(b.sortOrder), 'sortOrder harus integer.'); out.sort_order = b.sortOrder; }
    return out;
  }
  async function assertCategory(c, req, id) {
    if (!id) return;
    const r = await c.query('SELECT 1 FROM menu_categories WHERE tenant_id=$1 AND id=$2', [req.auth.tenant_id, id]);
    if (!r.rowCount) throw new HttpError(404, { error: 'Kategori tidak ditemukan.' });
  }
  async function upsertMenuStock(c, req, menuItemId, { trackStock, quantity }, note) {
    if (typeof trackStock !== 'boolean' || !Number.isInteger(quantity) || quantity < 0 || quantity > 1000000) throw new HttpError(400, { error: 'stock.trackStock boolean dan stock.quantity integer 0–1.000.000 wajib valid.' });
    const old = await c.query('SELECT quantity,track_stock FROM menu_stock WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 FOR UPDATE', [req.auth.tenant_id, req.auth.outlet_id, menuItemId]);
    const next = trackStock ? quantity : 0, prior = old.rowCount && old.rows[0].track_stock ? Number(old.rows[0].quantity) : 0;
    await c.query(`INSERT INTO menu_stock(tenant_id,outlet_id,menu_item_id,quantity,track_stock,updated_at,updated_by_staff_id) VALUES($1,$2,$3,$4,$5,now(),$6)
      ON CONFLICT(tenant_id,outlet_id,menu_item_id) DO UPDATE SET quantity=EXCLUDED.quantity,track_stock=EXCLUDED.track_stock,updated_at=now(),updated_by_staff_id=EXCLUDED.updated_by_staff_id`,
    [req.auth.tenant_id, req.auth.outlet_id, menuItemId, next, trackStock, req.auth.staff_id]);
    if (next - prior !== 0) {
      await c.query(`INSERT INTO menu_stock_movements(tenant_id,outlet_id,menu_item_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by_staff_id)
        VALUES($1,$2,$3,$4,$5,'stock_adjustment',$6,$7,$8)`, [req.auth.tenant_id, req.auth.outlet_id, menuItemId, old.rowCount ? 'adjustment' : 'opening', next - prior, randomUUID(), note, req.auth.staff_id]);
    }
  }

  app.post('/api/admin/menu', authenticate, managerOrOwner, route(async (req, res) => {
    const b = req.body || {};
    const v = validateMenuBody(b, { partial: false });
    const scope = b.scope === 'outlet' ? 'outlet' : 'tenant';
    const item = await scoped(req, async (c) => {
      await assertCategory(c, req, v.category_id);
      const row = (await c.query(`INSERT INTO menu_items(tenant_id,outlet_id,category_id,sku,name,description,destination,price,cost_price,image_url,is_available,sort_order)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [req.auth.tenant_id, scope === 'outlet' ? req.auth.outlet_id : null, v.category_id || null, v.sku || null, v.name, v.description || null, v.destination || 'kitchen', v.price, v.cost_price ?? 0, v.image_url || null, v.is_available ?? true, v.sort_order ?? 0])).rows[0];
      if (b.stock !== undefined) await upsertMenuStock(c, req, row.id, b.stock || {}, 'Stok awal menu baru');
      await audit(c, req, 'menu_item.created', 'menu_item', row.id, { name: v.name, price: v.price, scope });
      return loadMenuItem(c, req, row.id);
    });
    res.status(201).json(item);
  }));

  app.patch('/api/admin/menu/:menuItemId', authenticate, managerOrOwner, route(async (req, res) => {
    if (!isUuid(req.params.menuItemId)) return res.status(400).json({ error: 'ID menu tidak valid.' });
    const b = req.body || {};
    const v = validateMenuBody(b, { partial: true });
    if (!Object.keys(v).length && b.stock === undefined) return res.status(400).json({ error: 'Tidak ada perubahan.' });
    const item = await scoped(req, async (c) => {
      const cur = await c.query('SELECT id,price FROM menu_items WHERE tenant_id=$1 AND (outlet_id IS NULL OR outlet_id=$2) AND id=$3 FOR UPDATE', [req.auth.tenant_id, req.auth.outlet_id, req.params.menuItemId]);
      if (!cur.rowCount) throw new HttpError(404, { error: 'Menu tidak ditemukan di outlet ini.' });
      await assertCategory(c, req, v.category_id);
      const keys = Object.keys(v);
      if (keys.length) {
        const vals = [req.auth.tenant_id, req.params.menuItemId, ...keys.map((k) => v[k])];
        await c.query('UPDATE menu_items SET ' + keys.map((k, i) => k + '=$' + (i + 3)).join(',') + ',updated_at=now() WHERE tenant_id=$1 AND id=$2', vals);
      }
      if (b.stock !== undefined) await upsertMenuStock(c, req, req.params.menuItemId, b.stock || {}, 'Penyesuaian dari admin menu');
      await audit(c, req, 'menu_item.updated', 'menu_item', req.params.menuItemId, { changes: Object.keys(b), previousPrice: num(cur.rows[0].price) });
      return loadMenuItem(c, req, req.params.menuItemId);
    });
    res.json(item);
  }));

  // ---- recipe / BOM ------------------------------------------------------------------------------------
  const loadRecipe = async (c, req, menuItemId) => {
    const recipe = await c.query(`SELECT id,version FROM recipes WHERE tenant_id=$1 AND menu_item_id=$3 AND is_active AND (outlet_id IS NULL OR outlet_id=$2) ORDER BY version DESC LIMIT 1`, [req.auth.tenant_id, req.auth.outlet_id, menuItemId]);
    if (!recipe.rowCount) return { version: 0, lines: [], totalCost: 0 };
    const lines = await c.query(`SELECT rl.inventory_item_id,rl.quantity,i.name,i.unit_code,i.average_unit_cost FROM recipe_lines rl
      JOIN inventory_items i ON i.tenant_id=rl.tenant_id AND i.id=rl.inventory_item_id WHERE rl.tenant_id=$1 AND rl.recipe_id=$2 ORDER BY i.name`, [req.auth.tenant_id, recipe.rows[0].id]);
    const mapped = lines.rows.map((l) => ({ itemId: l.inventory_item_id, name: l.name, unitCode: l.unit_code, quantity: num(l.quantity), unitCost: num(l.average_unit_cost), lineCost: round(num(l.quantity) * num(l.average_unit_cost), 2) }));
    return { version: recipe.rows[0].version, lines: mapped, totalCost: round(mapped.reduce((s, l) => s + l.lineCost, 0), 2) };
  };
  app.get('/api/admin/menu/:menuItemId/recipe', authenticate, managerOrOwner, route(async (req, res) => {
    if (!isUuid(req.params.menuItemId)) return res.status(400).json({ error: 'ID menu tidak valid.' });
    res.json(await scoped(req, (c) => loadRecipe(c, req, req.params.menuItemId)));
  }));
  app.put('/api/admin/menu/:menuItemId/recipe', authenticate, managerOrOwner, route(async (req, res) => {
    if (!isUuid(req.params.menuItemId)) return res.status(400).json({ error: 'ID menu tidak valid.' });
    const lines = req.body?.lines, sync = req.body?.syncCostPrice === true;
    if (!Array.isArray(lines) || lines.length > 100) return res.status(400).json({ error: 'lines harus berupa array (maks. 100 bahan).' });
    const seen = new Set();
    for (const l of lines) {
      if (!isUuid(l.itemId) || typeof l.quantity !== 'number' || !Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 1e6 || seen.has(l.itemId)) return res.status(400).json({ error: 'Setiap bahan butuh itemId unik dan quantity > 0.' });
      seen.add(l.itemId);
    }
    const out = await scoped(req, async (c) => {
      const menu = await c.query('SELECT id FROM menu_items WHERE tenant_id=$1 AND (outlet_id IS NULL OR outlet_id=$2) AND id=$3 FOR UPDATE', [req.auth.tenant_id, req.auth.outlet_id, req.params.menuItemId]);
      if (!menu.rowCount) throw new HttpError(404, { error: 'Menu tidak ditemukan di outlet ini.' });
      if (lines.length) {
        const items = await c.query('SELECT id FROM inventory_items WHERE tenant_id=$1 AND outlet_id=$2 AND id=ANY($3::uuid[]) AND is_active', [req.auth.tenant_id, req.auth.outlet_id, [...seen]]);
        if (items.rowCount !== seen.size) throw new HttpError(400, { error: 'Satu atau lebih bahan tidak ditemukan/nonaktif di outlet ini.' });
      }
      const prev = await c.query('SELECT COALESCE(max(version),0) AS v FROM recipes WHERE tenant_id=$1 AND menu_item_id=$2 AND (outlet_id=$3 OR outlet_id IS NULL)', [req.auth.tenant_id, req.params.menuItemId, req.auth.outlet_id]);
      await c.query('UPDATE recipes SET is_active=false WHERE tenant_id=$1 AND menu_item_id=$2 AND is_active AND (outlet_id IS NULL OR outlet_id=$3)', [req.auth.tenant_id, req.params.menuItemId, req.auth.outlet_id]);
      if (lines.length) {
        const recipe = (await c.query('INSERT INTO recipes(tenant_id,outlet_id,menu_item_id,version) VALUES($1,$2,$3,$4) RETURNING id', [req.auth.tenant_id, req.auth.outlet_id, req.params.menuItemId, Number(prev.rows[0].v) + 1])).rows[0];
        for (const l of lines) await c.query('INSERT INTO recipe_lines(tenant_id,recipe_id,inventory_item_id,quantity) VALUES($1,$2,$3,$4)', [req.auth.tenant_id, recipe.id, l.itemId, l.quantity]);
      }
      const result = await loadRecipe(c, req, req.params.menuItemId);
      if (sync && result.lines.length) await c.query('UPDATE menu_items SET cost_price=$1,updated_at=now() WHERE tenant_id=$2 AND id=$3', [result.totalCost, req.auth.tenant_id, req.params.menuItemId]);
      await audit(c, req, 'menu_recipe.updated', 'menu_item', req.params.menuItemId, { ingredients: lines.length, totalCost: result.totalCost, syncCostPrice: sync });
      return result;
    });
    res.json(out);
  }));
}
