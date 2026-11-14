-- Inventory management: staff inventory role, lots/valuation (weighted average + FEFO traceability),
-- suppliers, goods receipts, stock-take (opname) with approval, and recipe-based depletion support.
-- Additive and idempotent. Review on an isolated Neon branch before any production use.
BEGIN;

-- 1. New POS role: inventory (staff gudang) ---------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conrelid::regclass::text AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('public.tenant_memberships'::regclass, 'public.outlet_memberships'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%role_code%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
  ALTER TABLE public.tenant_memberships ADD CONSTRAINT tenant_memberships_role_code_check
    CHECK (role_code IN ('owner','admin','manager','cashier','waiter','finance','kitchen','inventory'));
  ALTER TABLE public.outlet_memberships ADD CONSTRAINT outlet_memberships_role_code_check
    CHECK (role_code IN ('owner','admin','manager','cashier','waiter','finance','kitchen','inventory'));
END $$;

-- 2. Inventory item master: higher cost precision + planning attributes ------------------------------
ALTER TABLE public.inventory_items ALTER COLUMN average_unit_cost TYPE NUMERIC(14,4);
ALTER TABLE public.inventory_movements ALTER COLUMN unit_cost TYPE NUMERIC(14,4);
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS category VARCHAR(48),
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(64),
  ADD COLUMN IF NOT EXISTS max_level NUMERIC(16,4) CHECK (max_level IS NULL OR max_level >= 0),
  ADD COLUMN IF NOT EXISTS last_purchase_cost NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (last_purchase_cost >= 0),
  ADD COLUMN IF NOT EXISTS default_supplier_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  outlet_id UUID NOT NULL,
  name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(120),
  phone VARCHAR(40),
  email VARCHAR(254),
  address TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,outlet_id) REFERENCES public.outlets(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,outlet_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_name_ci ON public.suppliers(tenant_id,outlet_id,lower(name));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_items_default_supplier') THEN
    ALTER TABLE public.inventory_items ADD CONSTRAINT fk_inventory_items_default_supplier
      FOREIGN KEY (tenant_id,outlet_id,default_supplier_id) REFERENCES public.suppliers(tenant_id,outlet_id,id) ON DELETE SET NULL (default_supplier_id);
  END IF;
END $$;

-- 3. Goods receipts (header). Lines are inventory_movements with reference_type='receipt'. -----------
CREATE TABLE IF NOT EXISTS public.inventory_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  outlet_id UUID NOT NULL,
  receipt_number VARCHAR(40) NOT NULL,
  supplier_id UUID,
  invoice_no VARCHAR(64),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_value NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (total_value >= 0),
  note TEXT,
  idempotency_key VARCHAR(128) NOT NULL,
  created_by_staff_id UUID REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,outlet_id) REFERENCES public.outlets(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,outlet_id,supplier_id) REFERENCES public.suppliers(tenant_id,outlet_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,outlet_id,id),
  UNIQUE (tenant_id,outlet_id,receipt_number),
  UNIQUE (tenant_id,outlet_id,idempotency_key)
);

-- 4. Lots (batches) for FEFO traceability and expiry alerts -----------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  outlet_id UUID NOT NULL,
  inventory_item_id UUID NOT NULL,
  supplier_id UUID,
  lot_no VARCHAR(48),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_date DATE,
  quantity_received NUMERIC(16,4) NOT NULL CHECK (quantity_received > 0),
  quantity_remaining NUMERIC(16,4) NOT NULL CHECK (quantity_remaining >= 0),
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,outlet_id,inventory_item_id) REFERENCES public.inventory_items(tenant_id,outlet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,outlet_id,supplier_id) REFERENCES public.suppliers(tenant_id,outlet_id,id) ON DELETE SET NULL (supplier_id),
  UNIQUE (tenant_id,outlet_id,id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_fefo
  ON public.inventory_lots(tenant_id,outlet_id,inventory_item_id,expiry_date NULLS LAST,received_at)
  WHERE quantity_remaining > 0;

-- movement extras (valuation + traceability)
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS total_value NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS balance_after NUMERIC(16,4),
  ADD COLUMN IF NOT EXISTS supplier_id UUID,
  ADD COLUMN IF NOT EXISTS lot_id UUID,
  ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(64),
  ADD COLUMN IF NOT EXISTS expiry_date DATE;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference
  ON public.inventory_movements(tenant_id,outlet_id,reference_type,reference_id);
-- A recipe depletion / reversal is applied at most once per order item and ingredient.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_order_movement
  ON public.inventory_movements(tenant_id,outlet_id,reference_type,reference_id,inventory_item_id,movement_type)
  WHERE reference_type = 'order_item' AND movement_type IN ('sale','return');

-- which lots a movement drew from (needed to restore lots when an order item is cancelled)
CREATE TABLE IF NOT EXISTS public.inventory_lot_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  outlet_id UUID NOT NULL,
  movement_id UUID NOT NULL REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  lot_id UUID NOT NULL,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  restored_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id,outlet_id,lot_id) REFERENCES public.inventory_lots(tenant_id,outlet_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_lot_consumptions_movement ON public.inventory_lot_consumptions(tenant_id,outlet_id,movement_id);

-- 5. Stock take (opname) with approval --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  outlet_id UUID NOT NULL,
  take_number VARCHAR(40) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  storage_zone VARCHAR(48),
  note TEXT,
  submitted_by_staff_id UUID REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by_staff_id UUID REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  variance_value NUMERIC(16,2),
  FOREIGN KEY (tenant_id,outlet_id) REFERENCES public.outlets(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,outlet_id,id),
  UNIQUE (tenant_id,outlet_id,take_number)
);
CREATE TABLE IF NOT EXISTS public.stock_take_lines (
  tenant_id UUID NOT NULL,
  outlet_id UUID NOT NULL,
  stock_take_id UUID NOT NULL,
  inventory_item_id UUID NOT NULL,
  system_quantity NUMERIC(16,4) NOT NULL,
  counted_quantity NUMERIC(16,4) NOT NULL CHECK (counted_quantity >= 0),
  variance_quantity NUMERIC(16,4) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  variance_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  note TEXT,
  PRIMARY KEY (tenant_id,outlet_id,stock_take_id,inventory_item_id),
  FOREIGN KEY (tenant_id,outlet_id,stock_take_id) REFERENCES public.stock_takes(tenant_id,outlet_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,outlet_id,inventory_item_id) REFERENCES public.inventory_items(tenant_id,outlet_id,id) ON DELETE RESTRICT
);

-- 6. Row level security (same signed-context pattern as migration 004/006) ---------------------------
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['suppliers','inventory_receipts','inventory_lots','inventory_lot_consumptions','stock_takes','stock_take_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_outlet_isolation ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_outlet_isolation ON public.%I USING (
         app_private.rls_context()->''capabilities'' ? ''tenant_scope''
         AND tenant_id = NULLIF(app_private.rls_context()->>''tenant_id'','''')::UUID
         AND outlet_id = NULLIF(app_private.rls_context()->>''outlet_id'','''')::UUID
       ) WITH CHECK (
         app_private.rls_context()->''capabilities'' ? ''tenant_scope''
         AND tenant_id = NULLIF(app_private.rls_context()->>''tenant_id'','''')::UUID
         AND outlet_id = NULLIF(app_private.rls_context()->>''outlet_id'','''')::UUID
       )', tbl);
  END LOOP;
END $$;

-- 7. Least-privilege grants for the runtime role (scripts/db-provision-runtime-role.mjs mirrors this) -
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.inventory_items, public.suppliers, public.inventory_lots TO gastro_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON public.inventory_movements, public.inventory_receipts, public.stock_take_lines, public.inventory_lot_consumptions TO gastro_runtime';
    EXECUTE 'GRANT UPDATE (restored_at) ON public.inventory_lot_consumptions TO gastro_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.stock_takes TO gastro_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.menu_items, public.menu_categories, public.recipes TO gastro_runtime';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON public.recipe_lines TO gastro_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.tenant_settings, public.outlet_settings TO gastro_runtime';
  END IF;
END $$;

COMMIT;
