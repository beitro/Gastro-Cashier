-- Re-enable Owner-authenticated staff management (create staff, set/reset PIN, block/unblock accounts)
-- for gastro_runtime under signed RLS context (capabilities: tenant_scope + staff_admin, role_code = 'owner').
BEGIN;

CREATE OR REPLACE FUNCTION app_private.rls_has_capability(capability TEXT)
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app_private, public
AS $$
  SELECT COALESCE(app_private.rls_context()->'capabilities' ? capability, FALSE);
$$;

GRANT EXECUTE ON FUNCTION app_private.rls_has_capability(TEXT) TO PUBLIC;

-- Allow optional email/phone when creating staff via PIN-only POS enrollment,
-- and support 'suspended' / 'disabled' status values in addition to 'active' / 'inactive' / 'blocked'.
ALTER TABLE public.staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_check;
ALTER TABLE public.staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_status_check;
ALTER TABLE public.staff_accounts
  ADD CONSTRAINT staff_accounts_status_check
  CHECK (status IN ('active', 'inactive', 'blocked', 'suspended', 'disabled'));

-- Ensure boolean is_active column exists on tenant_memberships and outlet_memberships alongside status.
ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE public.tenant_memberships
  SET is_active = (status = 'active')
  WHERE is_active IS DISTINCT FROM (status = 'active');

ALTER TABLE public.outlet_memberships
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE public.outlet_memberships
  SET is_active = (status = 'active')
  WHERE is_active IS DISTINCT FROM (status = 'active');

-- Signed RLS policies for Owner-only staff creation, PIN updates, and account block/unblock.
DROP POLICY IF EXISTS staff_admin_insert ON public.staff_accounts;
CREATE POLICY staff_admin_insert ON public.staff_accounts FOR INSERT
  WITH CHECK (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND staff_accounts.id = NULLIF(app_private.rls_context()->>'pending_staff_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS staff_admin_update ON public.staff_accounts;
CREATE POLICY staff_admin_update ON public.staff_accounts FOR UPDATE
  USING (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
        = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
        AND actor_tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships target_tm
      WHERE target_tm.staff_id = staff_accounts.id
        AND target_tm.tenant_id = NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
        AND target_tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    )
  )
  WITH CHECK (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
        = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
        AND actor_tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships target_tm
      WHERE target_tm.staff_id = staff_accounts.id
        AND target_tm.tenant_id = NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
        AND target_tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    )
  );

DROP POLICY IF EXISTS tenant_membership_admin_insert ON public.tenant_memberships;
CREATE POLICY tenant_membership_admin_insert ON public.tenant_memberships FOR INSERT
  WITH CHECK (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = tenant_memberships.tenant_id
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS tenant_membership_admin_update ON public.tenant_memberships;
CREATE POLICY tenant_membership_admin_update ON public.tenant_memberships FOR UPDATE
  USING (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = tenant_memberships.tenant_id
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
  )
  WITH CHECK (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = tenant_memberships.tenant_id
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS outlet_membership_admin_insert ON public.outlet_memberships;
CREATE POLICY outlet_membership_admin_insert ON public.outlet_memberships FOR INSERT
  WITH CHECK (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id = NULLIF(app_private.rls_context()->>'outlet_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = outlet_memberships.tenant_id
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS outlet_membership_admin_update ON public.outlet_memberships;
CREATE POLICY outlet_membership_admin_update ON public.outlet_memberships FOR UPDATE
  USING (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id = NULLIF(app_private.rls_context()->>'outlet_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = outlet_memberships.tenant_id
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
  )
  WITH CHECK (
    app_private.rls_has_capability('staff_admin')
    AND app_private.rls_has_capability('tenant_scope')
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id = NULLIF(app_private.rls_context()->>'outlet_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = outlet_memberships.tenant_id
        AND actor_tm.role_code = 'owner'
        AND actor_tm.status = 'active'
        AND actor_tm.is_active = TRUE
    )
  );

DO $$
DECLARE runtime_role TEXT := 'gastro_runtime';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    EXECUTE format(
      'GRANT SELECT (id, display_name, email, phone, status, pin_hash, nfc_credential_hash, created_at, updated_at) ON TABLE public.staff_accounts TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT INSERT (id, email, phone, display_name, pin_hash, nfc_credential_hash, status) ON TABLE public.staff_accounts TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT UPDATE (display_name, email, phone, pin_hash, nfc_credential_hash, status, updated_at) ON TABLE public.staff_accounts TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT SELECT ON TABLE public.tenant_memberships, public.outlet_memberships TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT INSERT (tenant_id, staff_id, role_code, status, is_active) ON TABLE public.tenant_memberships TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT UPDATE (role_code, status, is_active) ON TABLE public.tenant_memberships TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT INSERT (tenant_id, outlet_id, tenant_membership_id, role_code, status, is_active) ON TABLE public.outlet_memberships TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT UPDATE (role_code, status, is_active) ON TABLE public.outlet_memberships TO %I',
      runtime_role
    );
    EXECUTE format(
      'GRANT UPDATE (revoked_at) ON TABLE public.staff_sessions TO %I',
      runtime_role
    );
  END IF;
END $$;

COMMIT;
