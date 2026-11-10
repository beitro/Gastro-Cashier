-- Incremental RLS hardening for an existing Gastro-Cashier database.
-- Run as the schema owner after backup and target verification. This does not migrate data.
BEGIN;CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
 scope_hash TEXT PRIMARY KEY CHECK(length(scope_hash)=64),
 failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts>=0),
 window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 blocked_until TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated ON public.auth_rate_limits(updated_at);

ALTER VIEW public.v_table_board SET (security_invoker = true);
DO $$ DECLARE tbl TEXT; BEGIN
 FOREACH tbl IN ARRAY ARRAY['outlet_memberships','outlet_settings','dining_tables','reservations','dining_sessions','menu_items','recipes','inventory_items','order_batches','payments','order_items','order_item_modifiers','payment_allocations','inventory_movements','audit_logs','outbox_events','idempotency_keys'] LOOP EXECUTE format('DROP POLICY IF EXISTS tenant_outlet_isolation ON %I',tbl); END LOOP;
 FOREACH tbl IN ARRAY ARRAY['outlets','tenant_memberships','tenant_settings','menu_categories','modifier_groups','modifier_options','recipe_lines'] LOOP EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',tbl); END LOOP;
 DROP POLICY IF EXISTS tenant_self_scope ON tenants;
 DROP POLICY IF EXISTS outlet_tenant_or_auth_lookup ON outlets;
 DROP POLICY IF EXISTS membership_tenant_or_auth_lookup ON tenant_memberships;
 DROP POLICY IF EXISTS outlet_membership_scope_or_auth_lookup ON outlet_memberships;
 DROP POLICY IF EXISTS staff_auth_or_tenant_scope ON staff_accounts;
 DROP POLICY IF EXISTS staff_bootstrap_insert ON staff_accounts;
 DROP POLICY IF EXISTS staff_session_token_or_scope ON staff_sessions;
 DROP POLICY IF EXISTS staff_session_token_only ON staff_sessions;
 DROP POLICY IF EXISTS staff_session_insert ON staff_sessions;
 DROP POLICY IF EXISTS staff_session_select_active ON staff_sessions;
 DROP POLICY IF EXISTS staff_session_select_own ON staff_sessions;
 DROP POLICY IF EXISTS staff_session_revoke_own ON staff_sessions;
END $$;
-- Tenant/outlet policies. Missing context always denies access.
DO $$
DECLARE tbl TEXT;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['outlet_settings','dining_tables','reservations','dining_sessions','menu_items','recipes','inventory_items','order_batches','payments','order_items','order_item_modifiers','payment_allocations','inventory_movements','audit_logs','outbox_events','idempotency_keys']
 LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY tenant_outlet_isolation ON %I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND (outlet_id IS NULL OR outlet_id=nullif(current_setting(''app.outlet_id'',true),'''')::uuid)) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND (outlet_id IS NULL OR outlet_id=nullif(current_setting(''app.outlet_id'',true),'''')::uuid))',tbl);
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['tenant_settings','menu_categories','modifier_groups','modifier_options','recipe_lines']
 LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',tbl);
 END LOOP;
 ALTER TABLE tenants ENABLE ROW LEVEL SECURITY; ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant_self_scope ON tenants USING (id=nullif(current_setting('app.tenant_id',true),'')::uuid OR current_setting('app.auth_lookup',true)='true' OR current_setting('app.bootstrap_mode',true)='true') WITH CHECK (id=nullif(current_setting('app.tenant_id',true),'')::uuid OR current_setting('app.bootstrap_mode',true)='true');
 ALTER TABLE outlets ENABLE ROW LEVEL SECURITY; ALTER TABLE outlets FORCE ROW LEVEL SECURITY;
 CREATE POLICY outlet_tenant_or_auth_lookup ON outlets USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid OR current_setting('app.auth_lookup',true)='true' OR current_setting('app.bootstrap_mode',true)='true') WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid OR current_setting('app.bootstrap_mode',true)='true');
 ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
 CREATE POLICY membership_tenant_or_auth_lookup ON tenant_memberships USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid OR current_setting('app.auth_lookup',true)='true' OR current_setting('app.bootstrap_mode',true)='true') WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid OR current_setting('app.bootstrap_mode',true)='true');
 ALTER TABLE outlet_memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE outlet_memberships FORCE ROW LEVEL SECURITY;
 CREATE POLICY outlet_membership_scope_or_auth_lookup ON outlet_memberships USING (current_setting('app.auth_lookup',true)='true' OR current_setting('app.bootstrap_mode',true)='true' OR (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid)) WITH CHECK ((tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid) OR current_setting('app.bootstrap_mode',true)='true');
 ALTER TABLE staff_accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE staff_accounts FORCE ROW LEVEL SECURITY;
 CREATE POLICY staff_auth_or_tenant_scope ON staff_accounts FOR SELECT USING (current_setting('app.auth_lookup',true)='true' OR current_setting('app.bootstrap_mode',true)='true' OR EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.staff_id=staff_accounts.id AND tm.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid));
 CREATE POLICY staff_bootstrap_insert ON staff_accounts FOR INSERT WITH CHECK (current_setting('app.bootstrap_mode',true)='true');
 ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE staff_sessions FORCE ROW LEVEL SECURITY;
 CREATE POLICY staff_session_insert ON staff_sessions FOR INSERT WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid);
 CREATE POLICY staff_session_select_own ON staff_sessions FOR SELECT USING (token_hash=nullif(current_setting('app.session_token_hash',true),''));
 CREATE POLICY staff_session_revoke_own ON staff_sessions FOR UPDATE USING (token_hash=nullif(current_setting('app.session_token_hash',true),'') AND revoked_at IS NULL AND expires_at>now()) WITH CHECK (true);
 ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
 ALTER TABLE auth_rate_limits FORCE ROW LEVEL SECURITY;
 DROP POLICY IF EXISTS auth_rate_limit_private ON auth_rate_limits;
 CREATE POLICY auth_rate_limit_private ON auth_rate_limits
   USING (current_setting('app.auth_rate_limit',true)='true')
   WITH CHECK (current_setting('app.auth_rate_limit',true)='true');
END $$;
COMMIT;