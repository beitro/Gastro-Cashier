-- Owner-authenticated staff administration, scoped to the active tenant/outlet.
-- app.staff_admin is a server-set request context, not an independent DB trust boundary.
-- Keep the API owner guard mandatory; use a separate DB principal before production rollout.
BEGIN;

DROP POLICY IF EXISTS staff_admin_insert ON staff_accounts;
DROP POLICY IF EXISTS staff_admin_update ON staff_accounts;
CREATE POLICY staff_admin_insert ON staff_accounts FOR INSERT
  WITH CHECK (current_setting('app.staff_admin',true)='true'
    AND current_setting('app.tenant_id',true) IS NOT NULL);
CREATE POLICY staff_admin_update ON staff_accounts FOR UPDATE
  USING (current_setting('app.staff_admin',true)='true'
    AND EXISTS (SELECT 1 FROM tenant_memberships tm
      WHERE tm.staff_id=staff_accounts.id
        AND tm.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
        AND tm.role_code='owner' AND tm.status='active'))
  WITH CHECK (current_setting('app.staff_admin',true)='true');

-- Split the legacy all-command scope policies into explicit read and write policies.
-- This prevents ordinary tenant-scoped sessions from inserting or changing memberships.
DROP POLICY IF EXISTS tenant_self_scope ON tenants;
CREATE POLICY tenant_self_scope ON tenants FOR SELECT
  USING (id=nullif(current_setting('app.tenant_id',true),'')::uuid
    OR current_setting('app.auth_lookup',true)='true'
    OR current_setting('app.bootstrap_mode',true)='true');
CREATE POLICY tenant_bootstrap_insert ON tenants FOR INSERT
  WITH CHECK (current_setting('app.bootstrap_mode',true)='true');

DROP POLICY IF EXISTS outlet_tenant_or_auth_lookup ON outlets;
CREATE POLICY outlet_tenant_or_auth_lookup ON outlets FOR SELECT
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    OR current_setting('app.auth_lookup',true)='true'
    OR current_setting('app.bootstrap_mode',true)='true');
CREATE POLICY outlet_bootstrap_insert ON outlets FOR INSERT
  WITH CHECK (current_setting('app.bootstrap_mode',true)='true');

DROP POLICY IF EXISTS membership_tenant_or_auth_lookup ON tenant_memberships;
CREATE POLICY membership_tenant_or_auth_lookup ON tenant_memberships FOR SELECT
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    OR current_setting('app.auth_lookup',true)='true'
    OR current_setting('app.bootstrap_mode',true)='true');
CREATE POLICY tenant_membership_bootstrap_insert ON tenant_memberships FOR INSERT
  WITH CHECK (current_setting('app.bootstrap_mode',true)='true');

DROP POLICY IF EXISTS outlet_membership_scope_or_auth_lookup ON outlet_memberships;
CREATE POLICY outlet_membership_scope_or_auth_lookup ON outlet_memberships FOR SELECT
  USING (current_setting('app.auth_lookup',true)='true'
    OR current_setting('app.bootstrap_mode',true)='true'
    OR (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
      AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid));
CREATE POLICY outlet_membership_bootstrap_insert ON outlet_memberships FOR INSERT
  WITH CHECK (current_setting('app.bootstrap_mode',true)='true');

DROP POLICY IF EXISTS tenant_membership_admin_insert ON tenant_memberships;
DROP POLICY IF EXISTS tenant_membership_admin_update ON tenant_memberships;
CREATE POLICY tenant_membership_admin_insert ON tenant_memberships FOR INSERT
  WITH CHECK (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_membership_admin_update ON tenant_memberships FOR UPDATE
  USING (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

DROP POLICY IF EXISTS outlet_membership_admin_insert ON outlet_memberships;
DROP POLICY IF EXISTS outlet_membership_admin_update ON outlet_memberships;
CREATE POLICY outlet_membership_admin_insert ON outlet_memberships FOR INSERT
  WITH CHECK (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid);
CREATE POLICY outlet_membership_admin_update ON outlet_memberships FOR UPDATE
  USING (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid);

DROP POLICY IF EXISTS staff_session_admin_revoke ON staff_sessions;
CREATE POLICY staff_session_admin_revoke ON staff_sessions FOR UPDATE
  USING (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid)
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid);

COMMIT;
