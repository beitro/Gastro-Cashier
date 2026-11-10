-- Owner-only staff administration, scoped to the authenticated tenant and outlet.
-- Apply as schema owner after verifying the target database and backup.
BEGIN;

DROP POLICY IF EXISTS staff_admin_insert ON staff_accounts;
DROP POLICY IF EXISTS staff_admin_update ON staff_accounts;
CREATE POLICY staff_admin_insert ON staff_accounts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM tenant_memberships tm
    WHERE tm.staff_id = (SELECT id FROM staff_accounts WHERE false)
      AND tm.tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid
      AND tm.role_code = 'owner' AND tm.status = 'active'
  ));
-- Staff creation is authorized by a transaction-local, server-set owner context.
-- The API sets this only after authenticating an active owner session.
DROP POLICY IF EXISTS staff_admin_insert ON staff_accounts;
CREATE POLICY staff_admin_insert ON staff_accounts FOR INSERT
  WITH CHECK (current_setting('app.staff_admin',true)='true'
    AND EXISTS (SELECT 1 FROM tenant_memberships tm
      WHERE tm.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
        AND tm.role_code='owner' AND tm.status='active'));
CREATE POLICY staff_admin_update ON staff_accounts FOR UPDATE
  USING (current_setting('app.staff_admin',true)='true'
    AND EXISTS (SELECT 1 FROM tenant_memberships tm
      WHERE tm.staff_id=staff_accounts.id
        AND tm.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
        AND tm.role_code='owner' AND tm.status='active'))
  WITH CHECK (current_setting('app.staff_admin',true)='true');

DROP POLICY IF EXISTS tenant_membership_admin_insert ON tenant_memberships;
DROP POLICY IF EXISTS tenant_membership_admin_update ON tenant_memberships;
CREATE POLICY tenant_membership_admin_insert ON tenant_memberships FOR INSERT
  WITH CHECK (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND EXISTS (SELECT 1 FROM tenant_memberships owner_tm
      WHERE owner_tm.tenant_id=tenant_memberships.tenant_id
        AND owner_tm.role_code='owner' AND owner_tm.status='active'));
CREATE POLICY tenant_membership_admin_update ON tenant_memberships FOR UPDATE
  USING (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND EXISTS (SELECT 1 FROM tenant_memberships owner_tm
      WHERE owner_tm.tenant_id=tenant_memberships.tenant_id
        AND owner_tm.role_code='owner' AND owner_tm.status='active'))
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

DROP POLICY IF EXISTS outlet_membership_admin_insert ON outlet_memberships;
DROP POLICY IF EXISTS outlet_membership_admin_update ON outlet_memberships;
CREATE POLICY outlet_membership_admin_insert ON outlet_memberships FOR INSERT
  WITH CHECK (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid
    AND EXISTS (SELECT 1 FROM tenant_memberships tm
      WHERE tm.tenant_id=outlet_memberships.tenant_id
        AND tm.id=outlet_memberships.tenant_membership_id
        AND tm.role_code='owner' AND tm.status='active'));
CREATE POLICY outlet_membership_admin_update ON outlet_memberships FOR UPDATE
  USING (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid
    AND EXISTS (SELECT 1 FROM tenant_memberships tm
      WHERE tm.tenant_id=outlet_memberships.tenant_id
        AND tm.role_code='owner' AND tm.status='active'))
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid);

DROP POLICY IF EXISTS staff_session_admin_revoke ON staff_sessions;
CREATE POLICY staff_session_admin_revoke ON staff_sessions FOR UPDATE
  USING (current_setting('app.staff_admin',true)='true'
    AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid
    AND EXISTS (SELECT 1 FROM tenant_memberships tm
      WHERE tm.tenant_id=staff_sessions.tenant_id
        AND tm.role_code='owner' AND tm.status='active'))
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND outlet_id=nullif(current_setting('app.outlet_id',true),'')::uuid);

COMMIT;
