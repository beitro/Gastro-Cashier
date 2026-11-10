-- Emergency POS release: keep staff directory reads, revoke all runtime staff mutations.
-- Apply as database/schema owner after the signed-context migration and before API rollout.
BEGIN;

DO $$
DECLARE runtime_role TEXT := 'gastro_runtime';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.staff_accounts, public.tenant_memberships, public.outlet_memberships FROM %I',
      runtime_role
    );
    -- The runtime role previously received column-level INSERT/UPDATE grants.
    EXECUTE format(
      'REVOKE INSERT (id,email,phone,display_name,pin_hash,nfc_credential_hash) ON TABLE public.staff_accounts FROM %I',
      runtime_role
    );
    EXECUTE format(
      'REVOKE UPDATE (email,phone,display_name,status,pin_hash,nfc_credential_hash) ON TABLE public.staff_accounts FROM %I',
      runtime_role
    );
    EXECUTE format(
      'REVOKE UPDATE (role_code,status) ON TABLE public.tenant_memberships FROM %I',
      runtime_role
    );
    EXECUTE format(
      'REVOKE UPDATE (role_code,status) ON TABLE public.outlet_memberships FROM %I',
      runtime_role
    );
  END IF;
END $$;

COMMIT;
