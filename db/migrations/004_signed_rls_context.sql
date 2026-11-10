-- Signed request-context trust boundary for runtime RLS.
-- Apply as schema owner after a verified backup. Provision the HMAC key separately
-- with scripts/db-provision-rls-context-key.mjs; never commit the key.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app_private.rls_context_keys (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  secret BYTEA NOT NULL CHECK (octet_length(secret) >= 32),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.rls_context_keys FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.rls_context()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app_private, public
AS $$
DECLARE
  token TEXT;
  payload_part TEXT;
  signature_part TEXT;
  payload_bytes BYTEA;
  supplied_signature BYTEA;
  expected_signature BYTEA;
  secret_bytes BYTEA;
  claims JSONB;
  now_epoch BIGINT;
BEGIN
  token := current_setting('app.context_token', TRUE);
  IF token IS NULL OR length(token) > 8192 OR length(token) < 20 THEN
    RETURN NULL;
  END IF;
  payload_part := split_part(token, '.', 1);
  signature_part := split_part(token, '.', 2);
  IF payload_part = '' OR signature_part = '' OR split_part(token, '.', 3) <> '' THEN
    RETURN NULL;
  END IF;

  payload_bytes := decode(
    translate(payload_part, '-_', '+/') || repeat('=', (4 - length(payload_part) % 4) % 4),
    'base64'
  );
  supplied_signature := decode(
    translate(signature_part, '-_', '+/') || repeat('=', (4 - length(signature_part) % 4) % 4),
    'base64'
  );
  SELECT secret INTO secret_bytes
    FROM app_private.rls_context_keys
    WHERE singleton = TRUE;
  IF secret_bytes IS NULL THEN
    RETURN NULL;
  END IF;
  expected_signature := public.hmac(payload_bytes, secret_bytes, 'sha256');
  IF expected_signature IS DISTINCT FROM supplied_signature THEN
    RETURN NULL;
  END IF;

  claims := convert_from(payload_bytes, 'UTF8')::JSONB;
  now_epoch := floor(extract(epoch FROM statement_timestamp()))::BIGINT;
  IF claims->>'v' <> '1'
     OR jsonb_typeof(claims->'capabilities') <> 'array'
     OR COALESCE(claims->>'jti', '') = ''
     OR COALESCE((claims->>'iat')::BIGINT, 0) > now_epoch + 30
     OR COALESCE((claims->>'exp')::BIGINT, 0) <= now_epoch
     OR COALESCE((claims->>'exp')::BIGINT, 0) - COALESCE((claims->>'iat')::BIGINT, 0) > 120
     OR claims->>'txid' IS DISTINCT FROM txid_current()::TEXT THEN
    RETURN NULL;
  END IF;
  RETURN claims;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Runtime may invoke the verifier, but cannot read or modify the key table.
GRANT USAGE ON SCHEMA app_private TO PUBLIC;
REVOKE ALL ON app_private.rls_context_keys FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.rls_context() TO PUBLIC;

-- Remove every policy from the previous GUC-based migrations that grants access
-- based on app.tenant_id, app.outlet_id, app.auth_lookup, app.bootstrap_mode,
-- app.staff_admin, app.actor_staff_id, app.session_token_hash or app.auth_rate_limit.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'tenant_outlet_isolation','tenant_isolation','tenant_self_scope',
        'outlet_tenant_or_auth_lookup','membership_tenant_or_auth_lookup',
        'outlet_membership_scope_or_auth_lookup','staff_auth_or_tenant_scope',
        'staff_bootstrap_insert','staff_session_insert','staff_session_select_own',
        'staff_session_revoke_own','auth_rate_limit_private','staff_admin_insert',
        'staff_admin_update','tenant_bootstrap_insert','outlet_bootstrap_insert',
        'tenant_membership_bootstrap_insert','outlet_membership_bootstrap_insert',
        'tenant_membership_admin_insert','tenant_membership_admin_update',
        'outlet_membership_admin_insert','outlet_membership_admin_update',
        'staff_session_admin_revoke','staff_session_select_active'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- Capability and scope helpers. A caller-set legacy GUC never grants access.
-- Tenant/outlet tables.
CREATE POLICY tenant_self_scope ON public.tenants FOR SELECT
  USING (
    (app_private.rls_context()->'capabilities' ? 'tenant_scope'
      AND id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID)
    OR app_private.rls_context()->'capabilities' ? 'auth_lookup'
    OR app_private.rls_context()->'capabilities' ? 'bootstrap'
  );
CREATE POLICY tenant_bootstrap_insert ON public.tenants FOR INSERT
  WITH CHECK (app_private.rls_context()->'capabilities' ? 'bootstrap');

CREATE POLICY outlet_tenant_or_auth_lookup ON public.outlets FOR SELECT
  USING (
    (app_private.rls_context()->'capabilities' ? 'tenant_scope'
      AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID)
    OR app_private.rls_context()->'capabilities' ? 'auth_lookup'
    OR app_private.rls_context()->'capabilities' ? 'bootstrap'
  );
CREATE POLICY outlet_bootstrap_insert ON public.outlets FOR INSERT
  WITH CHECK (app_private.rls_context()->'capabilities' ? 'bootstrap');

CREATE POLICY membership_tenant_or_auth_lookup ON public.tenant_memberships FOR SELECT
  USING (
    (app_private.rls_context()->'capabilities' ? 'tenant_scope'
      AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID)
    OR app_private.rls_context()->'capabilities' ? 'auth_lookup'
    OR app_private.rls_context()->'capabilities' ? 'bootstrap'
  );
CREATE POLICY tenant_membership_bootstrap_insert ON public.tenant_memberships FOR INSERT
  WITH CHECK (app_private.rls_context()->'capabilities' ? 'bootstrap');
CREATE POLICY tenant_membership_admin_insert ON public.tenant_memberships FOR INSERT
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = tenant_memberships.tenant_id
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  );
CREATE POLICY tenant_membership_admin_update ON public.tenant_memberships FOR UPDATE
  USING (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = tenant_memberships.tenant_id
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  )
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = tenant_memberships.tenant_id
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  );

CREATE POLICY outlet_membership_scope_or_auth_lookup ON public.outlet_memberships FOR SELECT
  USING (
    app_private.rls_context()->'capabilities' ? 'auth_lookup'
    OR app_private.rls_context()->'capabilities' ? 'bootstrap'
    OR (
      app_private.rls_context()->'capabilities' ? 'tenant_scope'
      AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
      AND outlet_id = NULLIF(app_private.rls_context()->>'outlet_id','')::UUID
    )
  );
CREATE POLICY outlet_membership_bootstrap_insert ON public.outlet_memberships FOR INSERT
  WITH CHECK (app_private.rls_context()->'capabilities' ? 'bootstrap');
CREATE POLICY outlet_membership_admin_insert ON public.outlet_memberships FOR INSERT
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id = NULLIF(app_private.rls_context()->>'outlet_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = outlet_memberships.tenant_id
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  );
CREATE POLICY outlet_membership_admin_update ON public.outlet_memberships FOR UPDATE
  USING (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id = NULLIF(app_private.rls_context()->>'outlet_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = outlet_memberships.tenant_id
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  )
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id = NULLIF(app_private.rls_context()->>'outlet_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = outlet_memberships.tenant_id
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  );

-- Tenant-only and tenant/outlet data.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'outlet_settings','dining_tables','reservations','dining_sessions','menu_items',
    'recipes','inventory_items','order_batches','payments','order_items',
    'order_item_modifiers','payment_allocations','inventory_movements','audit_logs',
    'outbox_events','idempotency_keys'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_outlet_isolation ON public.%I USING (
        app_private.rls_context()->''capabilities'' ? ''tenant_scope''
        AND tenant_id = NULLIF(app_private.rls_context()->>''tenant_id'','''')::UUID
        AND (outlet_id IS NULL OR outlet_id = NULLIF(app_private.rls_context()->>''outlet_id'','''')::UUID)
      ) WITH CHECK (
        app_private.rls_context()->''capabilities'' ? ''tenant_scope''
        AND tenant_id = NULLIF(app_private.rls_context()->>''tenant_id'','''')::UUID
        AND (outlet_id IS NULL OR outlet_id = NULLIF(app_private.rls_context()->>''outlet_id'','''')::UUID)
      )', tbl
    );
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['tenant_settings','menu_categories','modifier_groups','modifier_options','recipe_lines'] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I USING (
        app_private.rls_context()->''capabilities'' ? ''tenant_scope''
        AND tenant_id = NULLIF(app_private.rls_context()->>''tenant_id'','''')::UUID
      ) WITH CHECK (
        app_private.rls_context()->''capabilities'' ? ''tenant_scope''
        AND tenant_id = NULLIF(app_private.rls_context()->>''tenant_id'','''')::UUID
      )', tbl
    );
  END LOOP;
END $$;

-- Staff credentials: broad lookup is available only with a signed auth_lookup capability.
CREATE POLICY staff_auth_or_tenant_scope ON public.staff_accounts FOR SELECT
  USING (
    app_private.rls_context()->'capabilities' ? 'auth_lookup'
    OR app_private.rls_context()->'capabilities' ? 'bootstrap'
    OR (
      app_private.rls_context()->'capabilities' ? 'tenant_scope'
      AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.staff_id = staff_accounts.id
        AND tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
      )
    )
  );
CREATE POLICY staff_bootstrap_insert ON public.staff_accounts FOR INSERT
  WITH CHECK (app_private.rls_context()->'capabilities' ? 'bootstrap');
CREATE POLICY staff_admin_insert ON public.staff_accounts FOR INSERT
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  );
CREATE POLICY staff_admin_update ON public.staff_accounts FOR UPDATE
  USING (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  )
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  );

-- Session access is separately capability-scoped. Tenant context alone cannot enumerate sessions.
CREATE POLICY staff_session_insert ON public.staff_sessions FOR INSERT
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'session_create'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND outlet_id = NULLIF(app_private.rls_context()->>'outlet_id','')::UUID
  );
CREATE POLICY staff_session_select_own ON public.staff_sessions FOR SELECT
  USING (
    token_hash = app_private.rls_context()->>'session_token_hash'
    AND app_private.rls_context()->'capabilities' ? 'session_lookup'
    OR (
      app_private.rls_context()->'capabilities' ? 'staff_admin'
      AND app_private.rls_context()->>'role_code' = 'owner'
      AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    )
  );
CREATE POLICY staff_session_revoke_own ON public.staff_sessions FOR UPDATE
  USING (
    token_hash = app_private.rls_context()->>'session_token_hash'
    AND app_private.rls_context()->'capabilities' ? 'session_revoke_self'
    AND revoked_at IS NULL AND expires_at > now()
  )
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'session_revoke_self'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
  );
CREATE POLICY staff_session_admin_revoke ON public.staff_sessions FOR UPDATE
  USING (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND app_private.rls_context()->>'role_code' = 'owner'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships actor_tm
      WHERE actor_tm.staff_id = NULLIF(app_private.rls_context()->>'actor_staff_id','')::UUID
        AND actor_tm.tenant_id = staff_sessions.tenant_id
        AND actor_tm.role_code = 'owner' AND actor_tm.status = 'active'
    )
  )
  WITH CHECK (
    app_private.rls_context()->'capabilities' ? 'staff_admin'
    AND tenant_id = NULLIF(app_private.rls_context()->>'tenant_id','')::UUID
  );

CREATE POLICY auth_rate_limit_private ON public.auth_rate_limits
  USING (app_private.rls_context()->'capabilities' ? 'auth_rate_limit')
  WITH CHECK (app_private.rls_context()->'capabilities' ? 'auth_rate_limit');

COMMIT;
