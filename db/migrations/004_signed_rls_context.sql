-- Signed, transaction-bound RLS context for the Gastro-Cashier runtime.
-- Apply after 002_rls_runtime_hardening.sql and 003_staff_admin_management.sql.
-- The shared HMAC secret is provisioned out-of-band into rls_context_keys; never commit it.
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
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app_private', 'public'
AS $function$
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
  signature_diff INTEGER := 0;
  byte_index INTEGER;
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
  IF octet_length(supplied_signature) <> 32 THEN
    RETURN NULL;
  END IF;
  FOR byte_index IN 0..31 LOOP
    signature_diff := signature_diff | (get_byte(expected_signature, byte_index) # get_byte(supplied_signature, byte_index));
  END LOOP;
  IF signature_diff <> 0 THEN
    RETURN NULL;
  END IF;

  claims := convert_from(payload_bytes, 'UTF8')::JSONB;
  now_epoch := floor(extract(epoch FROM statement_timestamp()))::BIGINT;
  IF claims->>'v' IS DISTINCT FROM '1'
     OR jsonb_typeof(claims->'capabilities') IS DISTINCT FROM 'array'
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
$function$


-- Remove all older unsigned-GUC policies before applying the signed-context policy set.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."auth_rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."auth_rate_limits" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."dining_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dining_sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."dining_tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dining_tables" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."idempotency_keys" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_movements" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."menu_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."menu_categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."menu_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."modifier_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."modifier_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."modifier_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."modifier_options" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."order_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_batches" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."order_item_modifiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_item_modifiers" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."outbox_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."outlet_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."outlet_memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."outlet_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."outlet_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."outlets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."outlets" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payment_allocations" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."recipe_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recipe_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recipes" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservations" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."staff_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."staff_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenants" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.audit_logs; CREATE POLICY tenant_outlet_isolation ON public.audit_logs AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS auth_rate_limit_private ON public.auth_rate_limits; CREATE POLICY auth_rate_limit_private ON public.auth_rate_limits AS PERMISSIVE FOR ALL TO public USING (((app_private.rls_context() -> 'capabilities'::text) ? 'auth_rate_limit'::text)) WITH CHECK (((app_private.rls_context() -> 'capabilities'::text) ? 'auth_rate_limit'::text));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.dining_sessions; CREATE POLICY tenant_outlet_isolation ON public.dining_sessions AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.dining_tables; CREATE POLICY tenant_outlet_isolation ON public.dining_tables AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.idempotency_keys; CREATE POLICY tenant_outlet_isolation ON public.idempotency_keys AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.inventory_items; CREATE POLICY tenant_outlet_isolation ON public.inventory_items AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.inventory_movements; CREATE POLICY tenant_outlet_isolation ON public.inventory_movements AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_isolation ON public.menu_categories; CREATE POLICY tenant_isolation ON public.menu_categories AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.menu_items; CREATE POLICY tenant_outlet_isolation ON public.menu_items AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_isolation ON public.modifier_groups; CREATE POLICY tenant_isolation ON public.modifier_groups AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)));

DROP POLICY IF EXISTS tenant_isolation ON public.modifier_options; CREATE POLICY tenant_isolation ON public.modifier_options AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.order_batches; CREATE POLICY tenant_outlet_isolation ON public.order_batches AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.order_item_modifiers; CREATE POLICY tenant_outlet_isolation ON public.order_item_modifiers AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.order_items; CREATE POLICY tenant_outlet_isolation ON public.order_items AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.outbox_events; CREATE POLICY tenant_outlet_isolation ON public.outbox_events AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS outlet_membership_admin_insert ON public.outlet_memberships; CREATE POLICY outlet_membership_admin_insert ON public.outlet_memberships AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = outlet_memberships.tenant_id) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text))))));

DROP POLICY IF EXISTS outlet_membership_admin_update ON public.outlet_memberships; CREATE POLICY outlet_membership_admin_update ON public.outlet_memberships AS PERMISSIVE FOR UPDATE TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = outlet_memberships.tenant_id) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text)))))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = outlet_memberships.tenant_id) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text))))));

DROP POLICY IF EXISTS outlet_membership_bootstrap_insert ON public.outlet_memberships; CREATE POLICY outlet_membership_bootstrap_insert ON public.outlet_memberships AS PERMISSIVE FOR INSERT TO public WITH CHECK (((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text));

DROP POLICY IF EXISTS outlet_membership_scope_or_auth_lookup ON public.outlet_memberships; CREATE POLICY outlet_membership_scope_or_auth_lookup ON public.outlet_memberships AS PERMISSIVE FOR SELECT TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'auth_lookup'::text) OR ((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text) OR (((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.outlet_settings; CREATE POLICY tenant_outlet_isolation ON public.outlet_settings AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS outlet_bootstrap_insert ON public.outlets; CREATE POLICY outlet_bootstrap_insert ON public.outlets AS PERMISSIVE FOR INSERT TO public WITH CHECK (((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text));

DROP POLICY IF EXISTS outlet_tenant_or_auth_lookup ON public.outlets; CREATE POLICY outlet_tenant_or_auth_lookup ON public.outlets AS PERMISSIVE FOR SELECT TO public USING (((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)) OR ((app_private.rls_context() -> 'capabilities'::text) ? 'auth_lookup'::text) OR ((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text)));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.payment_allocations; CREATE POLICY tenant_outlet_isolation ON public.payment_allocations AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.payments; CREATE POLICY tenant_outlet_isolation ON public.payments AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_isolation ON public.recipe_lines; CREATE POLICY tenant_isolation ON public.recipe_lines AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.recipes; CREATE POLICY tenant_outlet_isolation ON public.recipes AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS tenant_outlet_isolation ON public.reservations; CREATE POLICY tenant_outlet_isolation ON public.reservations AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((outlet_id IS NULL) OR (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS staff_admin_insert ON public.staff_accounts; CREATE POLICY staff_admin_insert ON public.staff_accounts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (id = (NULLIF((app_private.rls_context() ->> 'pending_staff_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text))))));

DROP POLICY IF EXISTS staff_admin_update ON public.staff_accounts; CREATE POLICY staff_admin_update ON public.staff_accounts AS PERMISSIVE FOR UPDATE TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND ((NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (actor_tm.tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM tenant_memberships target_tm
  WHERE ((target_tm.staff_id = staff_accounts.id) AND (target_tm.tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (target_tm.tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((target_tm.status)::text = 'active'::text)))))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND ((NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (actor_tm.tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM tenant_memberships target_tm
  WHERE ((target_tm.staff_id = staff_accounts.id) AND (target_tm.tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (target_tm.tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((target_tm.status)::text = 'active'::text))))));

DROP POLICY IF EXISTS staff_auth_or_tenant_scope ON public.staff_accounts; CREATE POLICY staff_auth_or_tenant_scope ON public.staff_accounts AS PERMISSIVE FOR SELECT TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'auth_lookup'::text) OR ((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text) OR (((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND ((NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.staff_id = staff_accounts.id) AND (tm.tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) AND (tm.tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid))))) OR (((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND ((NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (id = (NULLIF((app_private.rls_context() ->> 'pending_staff_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text)))))));

DROP POLICY IF EXISTS staff_bootstrap_insert ON public.staff_accounts; CREATE POLICY staff_bootstrap_insert ON public.staff_accounts AS PERMISSIVE FOR INSERT TO public WITH CHECK (((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text));

DROP POLICY IF EXISTS staff_session_admin_revoke ON public.staff_sessions; CREATE POLICY staff_session_admin_revoke ON public.staff_sessions AS PERMISSIVE FOR UPDATE TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = staff_sessions.tenant_id) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text)))))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)));

DROP POLICY IF EXISTS staff_session_insert ON public.staff_sessions; CREATE POLICY staff_session_insert ON public.staff_sessions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'session_create'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (outlet_id = (NULLIF((app_private.rls_context() ->> 'outlet_id'::text), ''::text))::uuid)));

DROP POLICY IF EXISTS staff_session_revoke_own ON public.staff_sessions; CREATE POLICY staff_session_revoke_own ON public.staff_sessions AS PERMISSIVE FOR UPDATE TO public USING (((token_hash = (app_private.rls_context() ->> 'session_token_hash'::text)) AND ((app_private.rls_context() -> 'capabilities'::text) ? 'session_revoke_self'::text) AND (revoked_at IS NULL) AND (expires_at > now()))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'session_revoke_self'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)));

DROP POLICY IF EXISTS staff_session_select_own ON public.staff_sessions; CREATE POLICY staff_session_select_own ON public.staff_sessions AS PERMISSIVE FOR SELECT TO public USING ((((token_hash = (app_private.rls_context() ->> 'session_token_hash'::text)) AND ((app_private.rls_context() -> 'capabilities'::text) ? 'session_lookup'::text)) OR (((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid))));

DROP POLICY IF EXISTS membership_tenant_or_auth_lookup ON public.tenant_memberships; CREATE POLICY membership_tenant_or_auth_lookup ON public.tenant_memberships AS PERMISSIVE FOR SELECT TO public USING (((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)) OR ((app_private.rls_context() -> 'capabilities'::text) ? 'auth_lookup'::text) OR ((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text)));

DROP POLICY IF EXISTS tenant_membership_admin_insert ON public.tenant_memberships; CREATE POLICY tenant_membership_admin_insert ON public.tenant_memberships AS PERMISSIVE FOR INSERT TO public WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = tenant_memberships.tenant_id) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text))))));

DROP POLICY IF EXISTS tenant_membership_admin_update ON public.tenant_memberships; CREATE POLICY tenant_membership_admin_update ON public.tenant_memberships AS PERMISSIVE FOR UPDATE TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = tenant_memberships.tenant_id) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text)))))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'staff_admin'::text) AND ((app_private.rls_context() ->> 'role_code'::text) = 'owner'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid) AND (EXISTS ( SELECT 1
   FROM tenant_memberships actor_tm
  WHERE ((actor_tm.staff_id = (NULLIF((app_private.rls_context() ->> 'actor_staff_id'::text), ''::text))::uuid) AND (actor_tm.tenant_id = tenant_memberships.tenant_id) AND ((actor_tm.role_code)::text = 'owner'::text) AND ((actor_tm.status)::text = 'active'::text))))));

DROP POLICY IF EXISTS tenant_membership_bootstrap_insert ON public.tenant_memberships; CREATE POLICY tenant_membership_bootstrap_insert ON public.tenant_memberships AS PERMISSIVE FOR INSERT TO public WITH CHECK (((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text));

DROP POLICY IF EXISTS tenant_isolation ON public.tenant_settings; CREATE POLICY tenant_isolation ON public.tenant_settings AS PERMISSIVE FOR ALL TO public USING ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid))) WITH CHECK ((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (tenant_id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)));

DROP POLICY IF EXISTS tenant_bootstrap_insert ON public.tenants; CREATE POLICY tenant_bootstrap_insert ON public.tenants AS PERMISSIVE FOR INSERT TO public WITH CHECK (((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text));

DROP POLICY IF EXISTS tenant_self_scope ON public.tenants; CREATE POLICY tenant_self_scope ON public.tenants AS PERMISSIVE FOR SELECT TO public USING (((((app_private.rls_context() -> 'capabilities'::text) ? 'tenant_scope'::text) AND (id = (NULLIF((app_private.rls_context() ->> 'tenant_id'::text), ''::text))::uuid)) OR ((app_private.rls_context() -> 'capabilities'::text) ? 'auth_lookup'::text) OR ((app_private.rls_context() -> 'capabilities'::text) ? 'bootstrap'::text)));

ALTER VIEW public.v_table_board SET (security_invoker = true);
REVOKE ALL ON FUNCTION app_private.rls_context() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gastro_runtime') THEN
    GRANT USAGE ON SCHEMA app_private TO gastro_runtime;
    GRANT EXECUTE ON FUNCTION app_private.rls_context() TO gastro_runtime;
  END IF;
END $$;
COMMIT;
