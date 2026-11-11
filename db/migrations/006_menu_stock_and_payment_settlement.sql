-- Menu-level stock, auditable movements, and safe pending-payment settlement.
-- Apply only after reviewing on an isolated development branch.
BEGIN;

CREATE TABLE IF NOT EXISTS public.menu_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  outlet_id UUID NOT NULL,
  menu_item_id UUID NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  track_stock BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_staff_id UUID REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,outlet_id) REFERENCES public.outlets(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,menu_item_id) REFERENCES public.menu_items(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,outlet_id,menu_item_id),
  UNIQUE (tenant_id,outlet_id,id)
);

CREATE TABLE IF NOT EXISTS public.menu_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  outlet_id UUID NOT NULL,
  menu_item_id UUID NOT NULL,
  order_item_id UUID,
  movement_type VARCHAR(16) NOT NULL CHECK (movement_type IN ('opening','sale','return','adjustment')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  reference_type VARCHAR(32),
  reference_id UUID,
  note TEXT,
  created_by_staff_id UUID REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,outlet_id) REFERENCES public.outlets(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,outlet_id,menu_item_id) REFERENCES public.menu_stock(tenant_id,outlet_id,menu_item_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,outlet_id,order_item_id) REFERENCES public.order_items(tenant_id,outlet_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_menu_stock_movement_history
  ON public.menu_stock_movements(tenant_id,outlet_id,menu_item_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_stock_order_movement
  ON public.menu_stock_movements(tenant_id,outlet_id,reference_type,reference_id,movement_type)
  WHERE reference_id IS NOT NULL AND movement_type IN ('sale','return');

ALTER TABLE public.payments ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.payments ALTER COLUMN paid_at DROP NOT NULL;
ALTER TABLE public.payments ALTER COLUMN paid_at DROP DEFAULT;
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_by_staff_id UUID REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(160),
  ADD COLUMN IF NOT EXISTS settlement_note TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_payment_per_session
  ON public.payments(tenant_id,outlet_id,session_id) WHERE status='pending';

ALTER TABLE public.menu_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_stock FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_outlet_isolation ON public.menu_stock;
CREATE POLICY tenant_outlet_isolation ON public.menu_stock
  USING (app_private.rls_context()->'capabilities' ? 'tenant_scope'
    AND tenant_id=NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id=NULLIF(app_private.rls_context()->>'outlet_id','')::UUID)
  WITH CHECK (app_private.rls_context()->'capabilities' ? 'tenant_scope'
    AND tenant_id=NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id=NULLIF(app_private.rls_context()->>'outlet_id','')::UUID);

ALTER TABLE public.menu_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_stock_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_outlet_isolation ON public.menu_stock_movements;
CREATE POLICY tenant_outlet_isolation ON public.menu_stock_movements
  USING (app_private.rls_context()->'capabilities' ? 'tenant_scope'
    AND tenant_id=NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id=NULLIF(app_private.rls_context()->>'outlet_id','')::UUID)
  WITH CHECK (app_private.rls_context()->'capabilities' ? 'tenant_scope'
    AND tenant_id=NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id=NULLIF(app_private.rls_context()->>'outlet_id','')::UUID);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gastro_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.menu_stock TO gastro_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON public.menu_stock_movements TO gastro_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.idempotency_keys TO gastro_runtime';
    EXECUTE 'GRANT UPDATE ON public.order_batches, public.payments TO gastro_runtime';
  END IF;
END $$;

COMMIT;
